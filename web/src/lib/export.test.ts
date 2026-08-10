import { describe, expect, it, vi } from 'vitest'

const { downloadMock, downloadTextFileMock } = vi.hoisted(() => ({
  downloadMock: vi.fn(),
  downloadTextFileMock: vi.fn(),
}))

vi.mock('./api-client', () => ({
  api: {
    download: downloadMock,
  },
}))

vi.mock('./download', () => ({
  downloadTextFile: downloadTextFileMock,
}))

import { downloadWorkspaceExport } from './export'

describe('workspace export', () => {
  it('downloads the server-generated complete export with its safe filename', async () => {
    downloadMock.mockResolvedValueOnce({
      filename: 'family-money-export-2026-08-02.csv',
      content: 'section,record_type\nworkspace,workspace\n',
    })

    const filename = await downloadWorkspaceExport('workspace/with spaces')

    expect(downloadMock).toHaveBeenCalledWith(
      '/workspaces/workspace%2Fwith%20spaces/export.csv',
    )
    expect(downloadTextFileMock).toHaveBeenCalledWith(
      'family-money-export-2026-08-02.csv',
      'section,record_type\nworkspace,workspace\n',
      'text/csv;charset=utf-8',
    )
    expect(filename).toBe('family-money-export-2026-08-02.csv')
  })

  it('uses a safe fallback name when the server omits a filename', async () => {
    downloadMock.mockResolvedValueOnce({ content: 'section\nworkspace\n' })

    await downloadWorkspaceExport('workspace-a')

    expect(downloadTextFileMock).toHaveBeenLastCalledWith(
      'workspace-export.csv',
      'section\nworkspace\n',
      'text/csv;charset=utf-8',
    )
  })

  it('adds an inclusive date-only range to the export request', async () => {
    downloadMock.mockResolvedValueOnce({
      filename: 'august.csv',
      content: 'section\nworkspace\n',
    })

    await downloadWorkspaceExport('workspace-a', {
      from: '2026-08-01',
      to: '2026-08-31',
    })

    expect(downloadMock).toHaveBeenLastCalledWith(
      '/workspaces/workspace-a/export.csv?from=2026-08-01&to=2026-08-31',
    )
  })

  it('forwards the active transaction query without changing values or order', async () => {
    downloadMock.mockResolvedValueOnce({
      filename: 'filtered.csv',
      content: 'section\ntransactions\n',
    })
    const filters = new URLSearchParams(
      'transactionId=0042&type=expense&minAmountMinor=1250&maxAmountMinor=9999',
    )

    await downloadWorkspaceExport('workspace-a', filters)

    expect(downloadMock).toHaveBeenLastCalledWith(
      '/workspaces/workspace-a/export.csv?transactionId=0042&type=expense&minAmountMinor=1250&maxAmountMinor=9999',
    )
    expect(filters.toString()).toBe(
      'transactionId=0042&type=expense&minAmountMinor=1250&maxAmountMinor=9999',
    )
  })
})
