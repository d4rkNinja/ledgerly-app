import {
  CalendarPlus,
  CreditCard,
  FileText,
  ReceiptText,
  Share2,
  Sparkles,
  TrendingDown,
  TrendingUp,
} from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import {
  useState,
} from 'react'
import {
  motion,
  useReducedMotion,
} from 'motion/react'
import { useApp } from '@/app/app-state'
import {
  bills as demoBills,
} from '@/domain/demo-data'
import type {
  Bill,
} from '@/domain/types'
import { api } from '@/lib/api-client'
import {
  downloadBillCalendarEvent,
} from '@/lib/download'
import { formatDate, formatMoney } from '@/lib/format'
import {
  buildBillReminderSharePayload,
  buildMonthlySummarySharePayload,
  type SharePayload,
} from '@/lib/share'
import { ShareSheet } from '@/components/share-sheet'
import {
  Badge,
  Button,
  EmptyState,
  ErrorState,
  IconButton,
  ListRow,
  PageHeader,
  Section,
} from '@/components/ui'

import {
  DataSkeleton,
  MoneyText,
  MotionListItem,
  PageFrame,
} from './shared'
import {
  friendlyLabel,
  hasWorkspacePermission,
  useFinanceData,
} from './data'

export function BillsPage() {
  const { demoMode, privacyMode, workspace } = useApp()
  const query = useFinanceData<Bill[]>('bills', '/bills', demoBills)
  const reduce = useReducedMotion()
  const [selectedBill, setSelectedBill] = useState<Bill | null>(null)
  const items = query.data ?? []
  const autopayCount = items.filter((bill) => bill.autopay).length
  const canShareBills = hasWorkspacePermission(
    demoMode,
    workspace.permissions,
    'export_data',
  )
  const billPayload = selectedBill
    ? buildBillReminderSharePayload(selectedBill, {
        locale: navigator.language,
        concealAmounts: privacyMode,
      })
    : null
  return (
    <PageFrame className="bills-page timeline-page">
      <PageHeader
        title="Bills"
        description="Know what is due before it becomes urgent."
      />
      {query.isLoading ? (
        <DataSkeleton />
      ) : query.isError ? (
        <ErrorState
          message="Bills are unavailable."
          retry={() => query.refetch()}
        />
      ) : !items.length ? (
        <EmptyState
          icon={<CreditCard />}
          title="No upcoming bills"
          message="Bills due in the next 30 days will appear here."
        />
      ) : (
        <Section>
          <div className="section-heading-row">
            <div>
              <h2>Upcoming</h2>
              <p>Next 30 days</p>
            </div>
            <Badge tone="positive">
              {autopayCount} {autopayCount === 1 ? 'bill' : 'bills'} on autopay
            </Badge>
          </div>
          <div className="timeline-list">
            {items.map((bill, index) => (
              <motion.div
                className="timeline-row"
                key={bill.id}
                initial={reduce ? false : { opacity: 0, x: -7 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{
                  duration: reduce ? 0 : 0.28,
                  delay: reduce ? 0 : Math.min(index * 0.045, 0.2),
                  ease: [0.16, 1, 0.3, 1],
                }}
              >
                <div className="date-block">
                  <span>{formatDate(bill.dueDate).split(' ')[0]}</span>
                  <strong>{formatDate(bill.dueDate).split(' ')[1]}</strong>
                </div>
                <div className="timeline-copy">
                  <strong>{bill.name}</strong>
                  <span>
                    {bill.autopay ? 'Autopay enabled' : 'Manual payment'}
                  </span>
                </div>
                <MoneyText money={bill.amount} />
                {canShareBills ? (
                  <IconButton
                    label={`Share reminder for ${bill.name}`}
                    onClick={() => setSelectedBill(bill)}
                  >
                    <Share2 />
                  </IconButton>
                ) : null}
                {index < items.length - 1 ? (
                  <span className="timeline-line" aria-hidden="true" />
                ) : null}
              </motion.div>
            ))}
          </div>
        </Section>
      )}
      <ShareSheet
        open={Boolean(selectedBill)}
        onOpenChange={(open) => {
          if (!open) setSelectedBill(null)
        }}
        payload={billPayload}
        privacyNote="Only the bill name, due date, payment mode, and visible amount are included. Payment accounts and IDs stay private."
        extraAction={
          selectedBill ? (
            <Button
              type="button"
              variant="quiet"
              onClick={() =>
                downloadBillCalendarEvent(
                  selectedBill,
                  privacyMode
                    ? undefined
                    : formatMoney(selectedBill.amount),
                )
              }
            >
              <CalendarPlus aria-hidden="true" />
              Add reminder to calendar
            </Button>
          ) : null
        }
      />
    </PageFrame>
  )
}

type ReportView = {
  incomeMinor: number
  spendingMinor: number
  netMinor: number
  byCategory: Record<string, number>
  summary: string
  disclaimer: string
}

function LiveInsightsPage() {
  const { privacyMode, workspace } = useApp()
  const reduce = useReducedMotion()
  const [sharePayload, setSharePayload] = useState<SharePayload | null>(null)
  const [period] = useState(() => {
    const to = new Date()
    const from = new Date(
      Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), 1),
    )
    return { from: from.toISOString(), to: to.toISOString() }
  })
  const reportQuery = useQuery({
    queryKey: ['insights', workspace.id, period.from, period.to],
    queryFn: () =>
      api.get<ReportView>(
        `/workspaces/${workspace.id}/reports/summary?from=${encodeURIComponent(period.from)}&to=${encodeURIComponent(period.to)}`,
      ),
    retry: 1,
  })

  if (reportQuery.isLoading) {
    return (
      <PageFrame className="insights-page analytics-page">
        <PageHeader
          title="Insights"
          description="Loading this month's factual summary."
        />
        <DataSkeleton />
      </PageFrame>
    )
  }
  if (reportQuery.isError || !reportQuery.data) {
    return (
      <PageFrame className="insights-page analytics-page">
        <PageHeader
          title="Insights"
          description="A factual summary of activity in the current month."
        />
        <ErrorState
          message="The live insight report could not be loaded."
          retry={() => reportQuery.refetch()}
        />
      </PageFrame>
    )
  }

  const report = reportQuery.data
  const currency = workspace.currency ?? 'INR'
  const comparisonMaximum = Math.max(
    Math.abs(report.incomeMinor),
    Math.abs(report.spendingMinor),
    1,
  )
  const incomeHeight = Math.max(
    report.incomeMinor === 0 ? 4 : 18,
    Math.round((Math.abs(report.incomeMinor) / comparisonMaximum) * 100),
  )
  const spendingHeight = Math.max(
    report.spendingMinor === 0 ? 4 : 18,
    Math.round((Math.abs(report.spendingMinor) / comparisonMaximum) * 100),
  )
  const categories = Object.entries(report.byCategory ?? {}).sort(
    (left, right) => right[1] - left[1],
  )
  const canShareReport =
    workspace.permissions?.includes('export_data') === true
  const reportPeriod = new Date(period.from)

  return (
    <PageFrame className="insights-page analytics-page">
      <PageHeader
        title="Insights"
        description="A factual summary of activity in the current month."
        actions={
          canShareReport ? (
            <Button
              variant="secondary"
              onClick={() =>
                setSharePayload(
                  buildMonthlySummarySharePayload(
                    {
                      period: {
                        year: reportPeriod.getUTCFullYear(),
                        month: reportPeriod.getUTCMonth() + 1,
                      },
                      income: {
                        amountMinor: report.incomeMinor,
                        currency,
                      },
                      spending: {
                        amountMinor: report.spendingMinor,
                        currency,
                      },
                      net: { amountMinor: report.netMinor, currency },
                      workspaceName: workspace.name,
                      topCategory: categories[0]
                        ? {
                            name: categories[0][0],
                            amount: {
                              amountMinor: categories[0][1],
                              currency,
                            },
                          }
                        : undefined,
                    },
                    {
                      locale: navigator.language,
                      concealAmounts: privacyMode,
                    },
                  ),
                )
              }
            >
              <Share2 aria-hidden="true" />
              Share summary
            </Button>
          ) : undefined
        }
      />
      <div className="insight-hero">
        <div>
          <span>Net cash flow this month</span>
          <MoneyText
            money={{ amountMinor: report.netMinor, currency }}
          />
          <Badge tone={report.netMinor >= 0 ? 'positive' : 'warning'}>
            {report.netMinor >= 0 ? (
              <TrendingUp aria-hidden="true" />
            ) : (
              <TrendingDown aria-hidden="true" />
            )}
            {report.netMinor >= 0
              ? 'Income is at or above spending'
              : 'Spending is above income'}
          </Badge>
        </div>
        <figure
          className="insight-bars"
          style={{ margin: 0, gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' }}
        >
          <figcaption className="insight-chart-caption">
            <span>
              <i className="income" aria-hidden="true" />
              Income
            </span>
            <span>
              <i className="expense" aria-hidden="true" />
              Spending
            </span>
            <span className="visually-hidden">
              Relative comparison of current-month income and spending.
            </span>
          </figcaption>
          {[
            ['income', incomeHeight],
            ['expense', spendingHeight],
          ].map(([kind, height], index) => (
            <motion.span
              key={String(kind)}
              className={String(kind)}
              aria-hidden="true"
              initial={reduce ? false : { scaleY: 0, opacity: 0 }}
              animate={{ scaleY: 1, opacity: 1 }}
              transition={{
                duration: reduce ? 0 : 0.42,
                delay: reduce ? 0 : Math.min(index * 0.055, 0.2),
                ease: [0.16, 1, 0.3, 1],
              }}
              style={{
                height: `${Number(height)}%`,
                transformOrigin: 'bottom',
              }}
            />
          ))}
        </figure>
      </div>
      <div className="insight-grid">
        <Section>
          <h2>Spending by category</h2>
          {categories.length ? (
            <div className="insight-list">
              {categories.map(([category, amountMinor], index) => (
                <MotionListItem key={category} index={index}>
                  <ListRow
                    leading={<ReceiptText aria-hidden="true" />}
                    title={friendlyLabel(category)}
                    subtitle="Current report period"
                    trailing={
                      <MoneyText money={{ amountMinor, currency }} />
                    }
                  />
                </MotionListItem>
              ))}
            </div>
          ) : (
            <EmptyState
              icon={<ReceiptText />}
              title="No spending in this period"
              message="Categories will appear after expense activity is recorded."
            />
          )}
        </Section>
        <Section className="insight-note">
          <FileText aria-hidden="true" />
          <h2>About this report</h2>
          <p>
            {report.summary ||
              'This report summarises income and spending recorded in the selected period.'}
          </p>
          <small>{report.disclaimer}</small>
        </Section>
      </div>
      <ShareSheet
        open={Boolean(sharePayload)}
        onOpenChange={(open) => {
          if (!open) setSharePayload(null)
        }}
        payload={sharePayload}
        privacyNote="Only monthly totals and the top category are included. Transactions, account details, member data, and internal IDs stay private."
      />
    </PageFrame>
  )
}

export function InsightsPage() {
  const { demoMode, privacyMode, workspace } = useApp()
  const reduce = useReducedMotion()
  const [sharePayload, setSharePayload] = useState<SharePayload | null>(null)
  if (!demoMode) return <LiveInsightsPage />
  const weeklyIndexes = [
    { week: 1, income: 42, spending: 61 },
    { week: 2, income: 50, spending: 78 },
    { week: 3, income: 58, spending: 82 },
    { week: 4, income: 68, spending: 88 },
  ]
  return (
    <PageFrame className="insights-page analytics-page">
      <PageHeader
        title="Insights"
        description="Patterns that help you decide what to change."
        actions={
          <Button
            variant="secondary"
            onClick={() =>
              setSharePayload(
                buildMonthlySummarySharePayload(
                  {
                    period: { year: 2026, month: 7 },
                    income: { amountMinor: 24650000, currency: 'INR' },
                    spending: { amountMinor: 15470000, currency: 'INR' },
                    net: { amountMinor: 9180000, currency: 'INR' },
                    workspaceName: workspace.name,
                    topCategory: {
                      name: 'Transport',
                      amount: { amountMinor: 3260000, currency: 'INR' },
                    },
                  },
                  {
                    locale: navigator.language,
                    concealAmounts: privacyMode,
                  },
                ),
              )
            }
          >
            <Share2 aria-hidden="true" />
            Share summary
          </Button>
        }
      />
      <div className="insight-hero">
        <div>
          <span>Net cash flow in July</span>
          <MoneyText money={{ amountMinor: 9180000, currency: 'INR' }} />
          <Badge tone="positive">
            <TrendingUp aria-hidden="true" />
            12% better than June
          </Badge>
        </div>
        <figure className="insight-bars" style={{ margin: 0 }}>
          <figcaption className="insight-chart-caption">
            <span>
              <i className="income" aria-hidden="true" />
              Income
            </span>
            <span>
              <i className="expense" aria-hidden="true" />
              Spending
            </span>
            <span className="visually-hidden">
              Four-week relative index comparison. Income rose from 42 in week
              one to 68 in week four. Spending rose from 61 to 88 over the same
              period.
            </span>
          </figcaption>
          {weeklyIndexes.flatMap(({ week, income, spending }) => [
            <motion.span
              key={`income-${week}`}
              className="income"
              aria-hidden="true"
              initial={reduce ? false : { scaleY: 0, opacity: 0 }}
              animate={{ scaleY: 1, opacity: 1 }}
              transition={{
                duration: reduce ? 0 : 0.42,
                delay: reduce ? 0 : (week - 1) * 0.08,
                ease: [0.16, 1, 0.3, 1],
              }}
              style={{ height: `${income}%`, transformOrigin: 'bottom' }}
            />,
            <motion.span
              key={`spending-${week}`}
              className="expense"
              aria-hidden="true"
              initial={reduce ? false : { scaleY: 0, opacity: 0 }}
              animate={{ scaleY: 1, opacity: 1 }}
              transition={{
                duration: reduce ? 0 : 0.42,
                delay: reduce ? 0 : (week - 1) * 0.08 + 0.035,
                ease: [0.16, 1, 0.3, 1],
              }}
              style={{ height: `${spending}%`, transformOrigin: 'bottom' }}
            />,
          ])}
        </figure>
      </div>
      <div className="insight-grid">
        <Section>
          <h2>Where spending changed</h2>
          <div className="insight-list">
            {[
              {
                icon: <TrendingDown aria-hidden="true" />,
                title: 'Dining',
                subtitle: 'Down from last month',
                change: '-18%',
                className: 'positive-text',
              },
              {
                icon: <TrendingUp aria-hidden="true" />,
                title: 'Transport',
                subtitle: 'Higher than your recent average',
                change: '+11%',
                className: 'warning-text',
              },
              {
                icon: <TrendingDown aria-hidden="true" />,
                title: 'Shopping',
                subtitle: 'Down from last month',
                change: '-7%',
                className: 'positive-text',
              },
            ].map((item, index) => (
              <MotionListItem key={item.title} index={index}>
                <ListRow
                  leading={item.icon}
                  title={item.title}
                  subtitle={item.subtitle}
                  trailing={
                    <strong className={item.className}>{item.change}</strong>
                  }
                />
              </MotionListItem>
            ))}
          </div>
        </Section>
        <Section className="insight-note">
          <Sparkles aria-hidden="true" />
          <h2>A useful pattern</h2>
          <p>
            Dining spend fell after you set a weekly limit. At the current pace,
            you could move the remaining amount to your emergency goal.
          </p>
          <Button
            variant="secondary"
            disabled
            title="Suggestion review is not connected yet"
          >
            Review suggestion
          </Button>
        </Section>
      </div>
      <ShareSheet
        open={Boolean(sharePayload)}
        onOpenChange={(open) => {
          if (!open) setSharePayload(null)
        }}
        payload={sharePayload}
        privacyNote="Only monthly totals and the top category are included. Transactions, account details, member data, and internal IDs stay private."
      />
    </PageFrame>
  )
}
