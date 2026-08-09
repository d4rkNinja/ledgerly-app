import { api } from './api-client'
import { downloadTextFile } from './download'

const FALLBACK_FILENAME = 'workspace-export.csv'

export type WorkspaceExportRange = {
  from: string
  to: string
}

export async function downloadWorkspaceExport(
  workspaceId: string,
  range?: WorkspaceExportRange,
) {
  const query = range
    ? `?from=${encodeURIComponent(range.from)}&to=${encodeURIComponent(range.to)}`
    : ''
  const response = await api.download(
    '/workspaces/' + encodeURIComponent(workspaceId) + '/export.csv' + query,
  )
  const filename = response.filename || FALLBACK_FILENAME
  downloadTextFile(filename, response.content, 'text/csv;charset=utf-8')
  return filename
}
