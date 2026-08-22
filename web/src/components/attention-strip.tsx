import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router'
import { CircleAlert } from 'lucide-react'
import { useApp } from '@/app/app-state'
import type { AttentionResult } from '@/domain/intelligence'
import { api } from '@/lib/api-client'
import { formatMoney } from '@/lib/format'

// Compact, progressive-disclosure surface for everything that may need
// action. Non-critical data: failures render nothing rather than blocking
// the home screen.
export function AttentionStrip() {
  const { demoMode, workspace } = useApp()
  const query = useQuery({
    queryKey: ['attention', workspace.id],
    queryFn: () =>
      api.get<unknown>(`/workspaces/${workspace.id}/attention`) as Promise<AttentionResult>,
    enabled: !demoMode,
    staleTime: 60_000,
    retry: false,
    refetchOnWindowFocus: true,
  })
  const items = query.data?.items ?? []
  if (!items.length) return null
  return (
    <nav className="attention-strip" aria-label="Needs your attention">
      <ul>
        {items.map((item) => (
          <li key={item.kind} data-severity={item.severity}>
            <Link to={item.href} className="attention-item">
              <CircleAlert size={15} aria-hidden="true" />
              <span className="attention-copy">
                <strong>{item.title}</strong>
                {item.detail ? <span>{item.detail}</span> : null}
              </span>
              {item.amountMinor && item.currency ? (
                <span className="attention-amount">
                  {formatMoney({ amountMinor: Math.abs(item.amountMinor), currency: item.currency })}
                </span>
              ) : null}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  )
}
