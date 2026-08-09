import {
  Capacitor,
  CapacitorHttp,
  type HttpOptions,
  type HttpResponse,
} from '@capacitor/core'

import type {
  ApiEnvelope,
  ApiErrorShape,
} from '@/domain/types'

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL as string | undefined) || 'http://80.225.194.189:3001/api/v1'
const AUTHORIZED_DEPLOYED_HTTP_API = 'http://80.225.194.189:3001/api/v1'
const AUTHORIZED_DEPLOYED_HTTPS_API = 'https://80.225.194.189:3001/api/v1'
let bearerToken = ''
const legacyVaultCache = new Map<string, string>()
const LEGACY_VAULT_CACHE_PREFIX = 'ledgerly:legacy-vault:'

export function setApiToken(token: string) {
  bearerToken = token
}

export function clearApiToken() {
  bearerToken = ''
  legacyVaultCache.clear()
}

export class ApiError extends Error {
  readonly code: string
  readonly fields?: Record<string, string>
  readonly requestId?: string
  readonly status: number

  constructor(error: ApiErrorShape, status: number) {
    super(error.message)
    this.name = 'ApiError'
    this.code = error.code
    this.fields = error.fields
    this.requestId = error.requestId
    this.status = status
  }
}

interface RequestOptions<TFallback> extends RequestInit {
  demoFallback?: () => TFallback
  retryLegacyVault?: boolean
}

type GetOptions<TFallback> = Omit<
  RequestOptions<TFallback>,
  'body' | 'method'
>

function fallbackApiError(status: number): ApiErrorShape {
  return status >= 500
    ? {
        code: 'service_unavailable',
        message: 'The service is unavailable. Try again shortly.',
      }
    : {
        code: 'unexpected_error',
        message: 'The request could not be completed. Please try again.',
      }
}

function normalizeApiError(
  payload: unknown,
  status: number,
  requestId?: string,
): ApiErrorShape {
  if (!payload || typeof payload !== 'object' || !('error' in payload)) {
    return { ...fallbackApiError(status), requestId }
  }

  const candidate = payload.error
  if (!candidate || typeof candidate !== 'object') {
    return { ...fallbackApiError(status), requestId }
  }

  const code =
    'code' in candidate && typeof candidate.code === 'string'
      ? candidate.code
      : undefined
  const message =
    'message' in candidate && typeof candidate.message === 'string'
      ? candidate.message
      : undefined
  const fields =
    'fields' in candidate &&
    candidate.fields !== null &&
    typeof candidate.fields === 'object'
      ? Object.fromEntries(
          Object.entries(candidate.fields).filter(
            (entry): entry is [string, string] =>
              typeof entry[1] === 'string',
          ),
        )
      : undefined
  const bodyRequestId =
    'requestId' in candidate && typeof candidate.requestId === 'string'
      ? candidate.requestId
      : undefined

  if (!code || !message) {
    return { ...fallbackApiError(status), requestId: bodyRequestId ?? requestId }
  }

  return {
    code,
    message,
    fields:
      fields && Object.keys(fields).length > 0 ? fields : undefined,
    requestId: bodyRequestId ?? requestId,
  }
}

function headersRecord(headers: HeadersInit | undefined) {
  const result: Record<string, string> = {}
  if (!headers) return result
  if (headers instanceof Headers) {
    headers.forEach((value, key) => {
      result[key] = value
    })
    return result
  }
  if (Array.isArray(headers)) {
    for (const [key, value] of headers) result[key] = value
    return result
  }
  return { ...headers }
}

function unwrapResponseBody<T>(body: unknown): T {
  let value = body
  for (let depth = 0; depth < 3; depth += 1) {
    if (typeof value === 'string') {
      try {
        value = JSON.parse(value) as unknown
        continue
      } catch {
        break
      }
    }
    if (value && typeof value === 'object' && 'data' in value) {
      value = value.data
      continue
    }
    if (value && typeof value === 'object' && 'items' in value) {
      value = value.items
      continue
    }
    break
  }
  return value as T
}

function responseHeader(
  headers: Record<string, string>,
  name: string,
) {
  const expected = name.toLowerCase()
  return Object.entries(headers).find(
    ([key]) => key.toLowerCase() === expected,
  )?.[1]
}

const LEGACY_FINANCE_WRITE_PATTERN =
  /^\/workspaces\/([^/]+)\/(accounts|transactions|budgets|goals|expense-claims)$/

function legacyFinanceWorkspaceId(path: string) {
  return LEGACY_FINANCE_WRITE_PATTERN.exec(path)?.[1]
}

function jsonRecord(body: BodyInit | null | undefined) {
  if (typeof body !== 'string') return undefined
  try {
    const parsed: unknown = JSON.parse(body)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : undefined
  } catch {
    return undefined
  }
}

function isLegacyVaultValidation(error: unknown) {
  return (
    error instanceof ApiError &&
    error.status === 422 &&
    (error.fields?.vaultId === 'is required' ||
      error.fields?.accountId ===
        'does not belong to the selected vault and currency')
  )
}

function legacyVaultCacheKey(workspaceId: string, currency: string) {
  return `${workspaceId}:${currency.toUpperCase()}`
}

function cachedLegacyVaultId(key: string) {
  const inMemory = legacyVaultCache.get(key)
  if (inMemory) return inMemory
  if (typeof localStorage === 'undefined') return undefined
  try {
    const persisted = localStorage.getItem(
      `${LEGACY_VAULT_CACHE_PREFIX}${key}`,
    )
    if (persisted) {
      legacyVaultCache.set(key, persisted)
      return persisted
    }
  } catch {
    // Storage is optional; the in-memory cache still covers the current session.
  }
  return undefined
}

function rememberLegacyVaultId(key: string, vaultId: string) {
  legacyVaultCache.set(key, vaultId)
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.setItem(`${LEGACY_VAULT_CACHE_PREFIX}${key}`, vaultId)
  } catch {
    // Storage is optional; the in-memory cache still covers the current session.
  }
}

function legacyVaultIdFromRecord(record: Record<string, unknown>) {
  for (const key of ['vaultId', 'vaultID', 'vault_id']) {
    const value = record[key]
    if (typeof value === 'string' && value) return value
  }
  const nestedVault = record.vault
  if (nestedVault && typeof nestedVault === 'object') {
    const value = (nestedVault as Record<string, unknown>).id
    if (typeof value === 'string' && value) return value
  }
  return undefined
}

async function ensureInternalVaultId(
  workspaceId: string,
  currency: string,
  accountId?: string,
) {
  if (!currency) return undefined
  const cacheKey = legacyVaultCacheKey(workspaceId, currency)
  const cached = cachedLegacyVaultId(cacheKey)
  if (cached) return cached

  if (accountId) {
    const accounts = await request<unknown>(
      `/workspaces/${workspaceId}/accounts`,
      { method: 'GET', retryLegacyVault: false },
    )
    const account = (Array.isArray(accounts) ? accounts : []).find((item) => {
      if (!item || typeof item !== 'object') return false
      const candidate = item as Record<string, unknown>
      return (
        String(candidate.id ?? '') === accountId &&
        String(candidate.currency ?? '').toUpperCase() === currency
      )
    })
    if (account && typeof account === 'object') {
      const vaultId = legacyVaultIdFromRecord(account as Record<string, unknown>)
      if (vaultId) {
        rememberLegacyVaultId(cacheKey, vaultId)
        return vaultId
      }
    }
  }

  const existing = await request<unknown>(
    `/workspaces/${workspaceId}/vaults`,
    { method: 'GET', retryLegacyVault: false },
  )
  const vaults = Array.isArray(existing) ? existing : []
  const matchingVault = vaults.find((item) => {
    if (!item || typeof item !== 'object') return false
    const vault = item as Record<string, unknown>
    return (
      vault.archived !== true &&
      vault.privacy === 'workspace' &&
      String(vault.currency ?? '').toUpperCase() === currency
    )
  })
  if (matchingVault && typeof matchingVault === 'object') {
    const id = (matchingVault as Record<string, unknown>).id
    if (typeof id === 'string' && id) {
      rememberLegacyVaultId(cacheKey, id)
      return id
    }
  }

  const created = await request<unknown>(
    `/workspaces/${workspaceId}/vaults`,
    {
      method: 'POST',
      body: JSON.stringify({
        name: 'General',
        type: 'workspace_default',
        currency,
        description: '',
        openingMinor: 0,
        privacy: 'workspace',
      }),
      retryLegacyVault: false,
    },
  )
  if (!created || typeof created !== 'object') return undefined
  const id = (created as Record<string, unknown>).id
  if (typeof id === 'string' && id) {
    rememberLegacyVaultId(cacheKey, id)
    return id
  }
  return undefined
}

async function requestViaNative<T>(
  path: string,
  init: RequestInit,
  headers: Record<string, string>,
): Promise<T> {
  const options: HttpOptions = {
    headers,
    method: (init.method ?? 'GET').toUpperCase(),
    responseType: 'json',
    url: `${API_BASE_URL}${path}`,
  }
  if (init.body !== undefined) options.data = init.body

  const response: HttpResponse = await CapacitorHttp.request(options)
  if (response.status < 200 || response.status >= 300) {
    throw new ApiError(
      normalizeApiError(
        response.data,
        response.status,
        responseHeader(response.headers, 'X-Request-ID'),
      ),
      response.status,
    )
  }
  if (response.status === 204) return undefined as T
  return unwrapResponseBody<T>(response.data)
}

async function request<T>(
  path: string,
  options: RequestOptions<T> = {},
): Promise<T> {
  const {
    demoFallback,
    headers,
    retryLegacyVault = true,
    ...init
  } = options
  const method = (init.method ?? 'GET').toUpperCase()
  try {
    const expectsJsonContentType =
      init.body !== undefined ||
      method === 'POST' ||
      method === 'PUT' ||
      method === 'PATCH'
    const customHeaders = headersRecord(headers)
    const requestHeaders: Record<string, string> = {
      Accept: 'application/json',
      ...(expectsJsonContentType
        ? { 'Content-Type': 'application/json' }
        : {}),
      ...(bearerToken ? { Authorization: `Bearer ${bearerToken}` } : {}),
      ...customHeaders,
    }
    const idempotencyHeader = Object.entries(customHeaders).find(
      ([key]) => key.toLowerCase() === 'idempotency-key',
    )
    if (idempotencyHeader) {
      requestHeaders['idempotency-key'] = idempotencyHeader[1]
    }
    if (Capacitor.isNativePlatform()) {
      return await requestViaNative<T>(path, init, requestHeaders)
    }
    const response = await fetch(`${API_BASE_URL}${path}`, {
      credentials: 'include',
      ...init,
      headers: requestHeaders,
    })

    if (!response.ok) {
      const body = await response.json().catch(() => undefined)
      const requestId =
        response.headers.get('X-Request-ID') ??
        response.headers.get('X-Request-Id') ??
        undefined
      throw new ApiError(
        normalizeApiError(body, response.status, requestId),
        response.status,
      )
    }

    if (response.status === 204) return undefined as T
    const body = (await response.json()) as
      | ApiEnvelope<T>
      | { items: T }
      | T
    return unwrapResponseBody<T>(body)
  } catch (error) {
    if (
      retryLegacyVault &&
      (API_BASE_URL === AUTHORIZED_DEPLOYED_HTTP_API ||
        API_BASE_URL === AUTHORIZED_DEPLOYED_HTTPS_API) &&
      method === 'POST' &&
      isLegacyVaultValidation(error)
    ) {
      const workspaceId = legacyFinanceWorkspaceId(path)
      const body = jsonRecord(init.body)
      if (workspaceId && body && !('vaultId' in body)) {
        try {
          const vaultId = await ensureInternalVaultId(
            workspaceId,
            String(body.currency ?? '').toUpperCase(),
            typeof body.accountId === 'string' ? body.accountId : undefined,
          )
          if (vaultId) {
            return request<T>(path, {
              ...init,
              body: JSON.stringify({ ...body, vaultId }),
              headers,
              retryLegacyVault: false,
            })
          }
        } catch {
          // Preserve the original validation response when legacy recovery
          // cannot complete; the caller still receives a useful field error.
        }
      }
    }
    if (
      demoFallback &&
      error instanceof TypeError &&
      (init.method === undefined || init.method === 'GET')
    ) {
      return demoFallback()
    }
    throw error
  }
}

export interface DownloadResponse {
  content: string
  filename?: string
}

function filenameFromContentDisposition(value: string | undefined) {
  if (!value) return undefined
  const encoded = /filename\*=UTF-8''([^;]+)/i.exec(value)?.[1]
  if (encoded) {
    try {
      return decodeURIComponent(encoded.replace(/^"(.*)"$/, '$1'))
    } catch {
      return undefined
    }
  }
  const plain = /filename="([^"]+)"|filename=([^;]+)/i.exec(value)
  return (plain?.[1] ?? plain?.[2])?.trim() || undefined
}

export async function download(path: string): Promise<DownloadResponse> {
  const requestHeaders: Record<string, string> = {
    Accept: 'text/csv',
    ...(bearerToken ? { Authorization: 'Bearer ' + bearerToken } : {}),
  }
  if (Capacitor.isNativePlatform()) {
    const response: HttpResponse = await CapacitorHttp.request({
      headers: requestHeaders,
      method: 'GET',
      responseType: 'text',
      url: API_BASE_URL + path,
    })
    if (response.status < 200 || response.status >= 300) {
      throw new ApiError(
        normalizeApiError(
          response.data,
          response.status,
          responseHeader(response.headers, 'X-Request-ID'),
        ),
        response.status,
      )
    }
    return {
      content: typeof response.data === 'string'
        ? response.data
        : String(response.data ?? ''),
      filename: filenameFromContentDisposition(
        responseHeader(response.headers, 'Content-Disposition'),
      ),
    }
  }

  const response = await fetch(API_BASE_URL + path, {
    credentials: 'include',
    headers: requestHeaders,
  })
  if (!response.ok) {
    const body = await response.json().catch(() => undefined)
    throw new ApiError(
      normalizeApiError(
        body,
        response.status,
        response.headers.get('X-Request-ID') ??
          response.headers.get('X-Request-Id') ??
          undefined,
      ),
      response.status,
    )
  }
  return {
    content: await response.text(),
    filename: filenameFromContentDisposition(
      response.headers.get('Content-Disposition') ?? undefined,
    ),
  }
}

function get<T>(
  path: string,
  fallbackOrOptions?: (() => T) | GetOptions<T>,
) {
  const options: GetOptions<T> =
    typeof fallbackOrOptions === 'function'
      ? { demoFallback: fallbackOrOptions }
      : (fallbackOrOptions ?? {})
  return request<T>(path, { ...options, method: 'GET' })
}

export const api = {
  get,
  download,
  post: <TResponse, TBody>(
    path: string,
    body: TBody,
    headers?: Record<string, string>,
  ) =>
    request<TResponse>(path, {
      method: 'POST',
      body: JSON.stringify(body),
      headers,
    }),
  patch: <TResponse, TBody>(path: string, body: TBody) =>
    request<TResponse>(path, { method: 'PATCH', body: JSON.stringify(body) }),
  delete: <TResponse>(path: string) =>
    request<TResponse>(path, { method: 'DELETE' }),
}
