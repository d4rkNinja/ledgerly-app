import { beforeEach, describe, expect, it, vi } from 'vitest'

const nativeHttpMocks = vi.hoisted(() => ({
  isNativePlatform: vi.fn(),
  request: vi.fn(),
}))

vi.mock('@capacitor/core', () => ({
  Capacitor: {
    isNativePlatform: nativeHttpMocks.isNativePlatform,
  },
  CapacitorHttp: {
    request: nativeHttpMocks.request,
  },
}))

import { api, clearApiToken, setApiToken } from './api-client'

const EXPECTED_API_BASE_URL =
  (import.meta.env.VITE_API_BASE_URL as string | undefined) ||
  'http://80.225.194.189:3001/api/v1'

describe('native HTTP API transport', () => {
  beforeEach(() => {
    nativeHttpMocks.isNativePlatform.mockReturnValue(true)
    clearApiToken()
    localStorage.clear()
    nativeHttpMocks.request.mockResolvedValue({
      data: { data: { id: 'user-1' } },
      headers: {},
      status: 201,
      url: EXPECTED_API_BASE_URL + '/auth/register',
    })
    vi.stubGlobal('fetch', vi.fn())
  })

  it('uses native transport for the authorized deployed HTTP API', async () => {
    await expect(
      api.post('/auth/register', {
        email: 'release@example.com',
        name: 'Release QA User',
        password: 'LedgerlyRelease2026',
      }),
    ).resolves.toEqual({ id: 'user-1' })

    expect(nativeHttpMocks.request).toHaveBeenCalledWith({
      data: JSON.stringify({
        email: 'release@example.com',
        name: 'Release QA User',
        password: 'LedgerlyRelease2026',
      }),
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      method: 'POST',
      responseType: 'json',
      url: EXPECTED_API_BASE_URL + '/auth/register',
    })
    expect(fetch).not.toHaveBeenCalled()
  })

  it('preserves idempotency keys across the native transport header bridge', async () => {
    setApiToken('test-token')

    await api.post(
      '/workspaces/workspace-1/transactions',
      { amountMinor: 100 },
      { 'Idempotency-Key': 'request-1234' },
    )

    expect(nativeHttpMocks.request).toHaveBeenCalledWith(
      expect.objectContaining({
        headers: expect.objectContaining({
          'Idempotency-Key': 'request-1234',
          'idempotency-key': 'request-1234',
        }),
      }),
    )
  })

  it('recovers legacy finance writes without exposing vault selection', async () => {
    setApiToken('test-token')
    nativeHttpMocks.request
      .mockResolvedValueOnce({
        data: {
          error: {
            code: 'validation_failed',
            message: 'request validation failed',
            fields: { vaultId: 'is required' },
          },
        },
        headers: {},
        status: 422,
      })
      .mockResolvedValueOnce({
        data: { items: null },
        headers: {},
        status: 200,
      })
      .mockResolvedValueOnce({
        data: { data: { id: 'vault-1' } },
        headers: {},
        status: 201,
      })
      .mockResolvedValueOnce({
        data: { data: { id: 'account-1' } },
        headers: {},
        status: 201,
      })

    await expect(
      api.post('/workspaces/workspace-1/accounts', {
        name: 'Cash',
        type: 'savings',
        currency: 'USD',
        openingMinor: 0,
        excludeFromTotal: false,
        privacy: 'workspace',
      }),
    ).resolves.toEqual({ id: 'account-1' })

    expect(nativeHttpMocks.request).toHaveBeenNthCalledWith(2, {
      headers: {
        Accept: 'application/json',
        Authorization: 'Bearer test-token',
      },
      method: 'GET',
      responseType: 'json',
      url: EXPECTED_API_BASE_URL + '/workspaces/workspace-1/vaults',
    })
    expect(nativeHttpMocks.request).toHaveBeenNthCalledWith(3, {
      data: JSON.stringify({
        name: 'General',
        type: 'workspace_default',
        currency: 'USD',
        description: '',
        openingMinor: 0,
        privacy: 'workspace',
      }),
      headers: {
        Accept: 'application/json',
        Authorization: 'Bearer test-token',
        'Content-Type': 'application/json',
      },
      method: 'POST',
      responseType: 'json',
      url: EXPECTED_API_BASE_URL + '/workspaces/workspace-1/vaults',
    })
    expect(nativeHttpMocks.request).toHaveBeenNthCalledWith(4, {
      data: JSON.stringify({
        name: 'Cash',
        type: 'savings',
        currency: 'USD',
        openingMinor: 0,
        excludeFromTotal: false,
        privacy: 'workspace',
        vaultId: 'vault-1',
      }),
      headers: {
        Accept: 'application/json',
        Authorization: 'Bearer test-token',
        'Content-Type': 'application/json',
      },
      method: 'POST',
      responseType: 'json',
      url: EXPECTED_API_BASE_URL + '/workspaces/workspace-1/accounts',
    })
  })

  it('reuses a vault created during legacy account recovery', async () => {
    setApiToken('test-token')
    nativeHttpMocks.request
      .mockResolvedValueOnce({
        data: {
          error: {
            code: 'validation_failed',
            message: 'request validation failed',
            fields: { vaultId: 'is required' },
          },
        },
        headers: {},
        status: 422,
      })
      .mockResolvedValueOnce({
        data: { data: { items: null } },
        headers: {},
        status: 200,
      })
      .mockResolvedValueOnce({
        data: { data: { data: { id: 'vault-cached' } } },
        headers: {},
        status: 201,
      })
      .mockResolvedValueOnce({
        data: { data: { id: 'account-2' } },
        headers: {},
        status: 201,
      })
      .mockResolvedValueOnce({
        data: {
          error: {
            code: 'validation_failed',
            message: 'request validation failed',
            fields: { vaultId: 'is required' },
          },
        },
        headers: {},
        status: 422,
      })
      .mockResolvedValueOnce({
        data: { data: { id: 'transaction-2' } },
        headers: {},
        status: 201,
      })

    await expect(
      api.post('/workspaces/workspace-2/accounts', {
        name: 'Cash',
        type: 'savings',
        currency: 'USD',
        openingMinor: 0,
        excludeFromTotal: false,
        privacy: 'workspace',
      }),
    ).resolves.toEqual({ id: 'account-2' })

    await expect(
      api.post(
        '/workspaces/workspace-2/transactions',
        {
          accountId: 'account-2',
          amountMinor: 1250,
          currency: 'USD',
          type: 'expense',
        },
        { 'Idempotency-Key': 'request-5678' },
      ),
    ).resolves.toEqual({ id: 'transaction-2' })

    expect(nativeHttpMocks.request).toHaveBeenCalledTimes(6)
    expect(nativeHttpMocks.request).toHaveBeenNthCalledWith(6, {
      data: JSON.stringify({
        accountId: 'account-2',
        amountMinor: 1250,
        currency: 'USD',
        type: 'expense',
        vaultId: 'vault-cached',
      }),
      headers: {
        Accept: 'application/json',
        Authorization: 'Bearer test-token',
        'Content-Type': 'application/json',
        'Idempotency-Key': 'request-5678',
        'idempotency-key': 'request-5678',
      },
      method: 'POST',
      responseType: 'json',
      url: EXPECTED_API_BASE_URL + '/workspaces/workspace-2/transactions',
    })
  })

  it('reuses the selected account vault for legacy transaction writes', async () => {
    setApiToken('test-token')
    nativeHttpMocks.request
      .mockResolvedValueOnce({
        data: {
          error: {
            code: 'validation_failed',
            message: 'request validation failed',
            fields: {
              accountId:
                'does not belong to the selected vault and currency',
            },
          },
        },
        headers: {},
        status: 422,
      })
      .mockResolvedValueOnce({
        data: JSON.stringify({
          items: [
            {
              id: 'account-1',
              currency: 'USD',
              vaultId: 'vault-1',
            },
          ],
        }),
        headers: {},
        status: 200,
      })
      .mockResolvedValueOnce({
        data: { data: { id: 'transaction-1' } },
        headers: {},
        status: 201,
      })

    await expect(
      api.post(
        '/workspaces/workspace-1/transactions',
        {
          accountId: 'account-1',
          amountMinor: 100,
          currency: 'USD',
          type: 'expense',
        },
        { 'Idempotency-Key': 'request-1234' },
      ),
    ).resolves.toEqual({ id: 'transaction-1' })

    expect(nativeHttpMocks.request).toHaveBeenNthCalledWith(2, {
      headers: {
        Accept: 'application/json',
        Authorization: 'Bearer test-token',
      },
      method: 'GET',
      responseType: 'json',
      url: EXPECTED_API_BASE_URL + '/workspaces/workspace-1/accounts',
    })
    expect(nativeHttpMocks.request).toHaveBeenNthCalledWith(3, {
      data: JSON.stringify({
        accountId: 'account-1',
        amountMinor: 100,
        currency: 'USD',
        type: 'expense',
        vaultId: 'vault-1',
      }),
      headers: {
        Accept: 'application/json',
        Authorization: 'Bearer test-token',
        'Content-Type': 'application/json',
        'Idempotency-Key': 'request-1234',
        'idempotency-key': 'request-1234',
      },
      method: 'POST',
      responseType: 'json',
      url: EXPECTED_API_BASE_URL + '/workspaces/workspace-1/transactions',
    })
  })
})
