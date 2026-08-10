import { api } from './api-client'
import { downloadTextFile } from './download'

const FALLBACK_FILENAME = 'workspace-export.csv'

export type WorkspaceExportRange = {
  from: string
  to: string
}

export type WorkspaceExportQuery = WorkspaceExportRange | URLSearchParams

function exportQueryString(query?: WorkspaceExportQuery) {
  if (!query) return ''
  const searchParams = query instanceof URLSearchParams
    ? new URLSearchParams(query)
    : new URLSearchParams({ from: query.from, to: query.to })
  const value = searchParams.toString()
  return value ? `?${value}` : ''
}

export async function downloadWorkspaceExport(
  workspaceId: string,
  queryParams?: WorkspaceExportQuery,
) {
  const response = await api.download(
    '/workspaces/' +
      encodeURIComponent(workspaceId) +
      '/export.csv' +
      exportQueryString(queryParams),
  )
  const filename = response.filename || FALLBACK_FILENAME
  downloadTextFile(filename, response.content, 'text/csv;charset=utf-8')
  return filename
}
