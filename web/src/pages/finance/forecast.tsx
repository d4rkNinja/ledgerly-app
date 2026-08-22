import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { CalendarRange, TrendingDown, TrendingUp } from 'lucide-react'
import { useApp } from '@/app/app-state'
import type {
  ForecastOneOffInput,
  ForecastPoint,
  ForecastResult,
  ForecastScenarioInput,
} from '@/domain/intelligence'
import { api } from '@/lib/api-client'
import { formatDate, formatMoney } from '@/lib/format'
import { Badge, Button, Dialog, ErrorState, Field, PageHeader, Section } from '@/components/ui'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/beui/select'
import { DataSkeleton, InfoNotice, PageFrame } from './shared'
import { hasWorkspacePermission } from './data'

const HORIZONS = [7, 30, 90] as const

interface OneOffDraft extends ForecastOneOffInput {}

function todayIso(offsetDays = 0) {
  const now = new Date()
  const day = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()))
  day.setUTCDate(day.getUTCDate() + offsetDays)
  return day.toISOString().slice(0, 10)
}

export function ForecastPage() {
  const { demoMode, workspace } = useApp()
  const canView = hasWorkspacePermission(demoMode, workspace.permissions, 'view_balances')
  const [days, setDays] = useState<number>(30)
  const [includeBills, setIncludeBills] = useState(true)
  const [includeBaseline, setIncludeBaseline] = useState(true)
  const [includeIncome, setIncludeIncome] = useState(true)
  const [oneOffs, setOneOffs] = useState<OneOffDraft[]>([])
  const [selectedDay, setSelectedDay] = useState<string | null>(null)

  const scenario: ForecastScenarioInput = useMemo(
    () => ({ days, includeBills, includeBaseline, includeIncome, oneOff: oneOffs }),
    [days, includeBills, includeBaseline, includeIncome, oneOffs],
  )

  const forecastQuery = useQuery({
    queryKey: ['forecast', workspace.id, JSON.stringify(scenario)],
    queryFn: () =>
      api.post<unknown, ForecastScenarioInput>(
        `/workspaces/${workspace.id}/forecast`,
        scenario,
      ) as Promise<ForecastResult>,
    enabled: canView && !demoMode,
    staleTime: 60_000,
    retry: 1,
  })

  if (!canView) {
    return (
      <PageFrame className="forecast-page">
        <PageHeader title="Forecast" description="See where your money is heading." />
        <InfoNotice>You need balance visibility to use the forecast.</InfoNotice>
      </PageFrame>
    )
  }

  // Demo sessions never call the forecast API; show the explainer only.
  if (demoMode) {
    return (
      <PageFrame className="forecast-page">
        <PageHeader
          title="Forecast"
          description="A deterministic projection from real balances, recurring bills, and your recent spending rhythm."
        />
        <InfoNotice>
          The forecast runs against live workspace data. Enter a live workspace to
          project balances, bills, and spending.
        </InfoNotice>
      </PageFrame>
    )
  }

  const currency = workspace.currency || forecastQuery.data?.currency || 'INR'
  const result = forecastQuery.data
  const selected = result?.points.find((point) => point.date === selectedDay) ?? null

  return (
    <PageFrame className="forecast-page">
      <PageHeader
        title="Forecast"
        description="A deterministic projection from real balances, recurring bills, and your recent spending rhythm."
      />

      <Section>
        <div className="section-heading-row">
          <div>
            <h2>Scenario</h2>
            <p>Choose a horizon and what to include</p>
          </div>
        </div>
        <div className="forecast-horizons" role="group" aria-label="Forecast horizon">
          {HORIZONS.map((horizon) => (
            <Button
              key={horizon}
              variant={days === horizon ? 'primary' : 'secondary'}
              onClick={() => setDays(horizon)}
              aria-pressed={days === horizon}
            >
              {horizon} days
            </Button>
          ))}
          <label className="forecast-custom-days">
            <input
              inputMode="numeric"
              value={String(days)}
              min={1}
              max={365}
              onChange={(event) => {
                const parsed = Number.parseInt(event.target.value, 10)
                if (!Number.isNaN(parsed)) setDays(Math.min(Math.max(parsed, 1), 365))
              }}
              aria-label="Custom horizon in days"
            />
            days
          </label>
        </div>
        <fieldset className="forecast-scenarios">
          <legend className="visually-hidden">Include in forecast</legend>
          <label className="forecast-toggle">
            <input
              type="checkbox"
              checked={includeBills}
              onChange={(event) => setIncludeBills(event.target.checked)}
            />
            Recurring bills
          </label>
          <label className="forecast-toggle">
            <input
              type="checkbox"
              checked={includeBaseline}
              onChange={(event) => setIncludeBaseline(event.target.checked)}
            />
            Typical daily spending
          </label>
          <label className="forecast-toggle">
            <input
              type="checkbox"
              checked={includeIncome}
              onChange={(event) => setIncludeIncome(event.target.checked)}
            />
            Typical daily income
          </label>
        </fieldset>

        <div className="forecast-oneoffs">
          {oneOffs.map((item, index) => (
            <div className="forecast-oneoff-row" key={index}>
              <input
                type="date"
                value={item.date}
                min={todayIso()}
                onChange={(event) =>
                  setOneOffs((current) =>
                    current.map((entry, position) =>
                      position === index ? { ...entry, date: event.target.value } : entry,
                    ),
                  )
                }
                aria-label={`Planned item ${index + 1} date`}
              />
              <Select
                value={item.direction}
                onValueChange={(value) =>
                  setOneOffs((current) =>
                    current.map((entry, position) =>
                      position === index
                        ? { ...entry, direction: value as 'income' | 'expense' }
                        : entry,
                    ),
                  )
                }
              >
                <SelectTrigger
                  aria-label={`Planned item ${index + 1} direction`}
                  className="w-full"
                  data-field-control
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="expense">Expense</SelectItem>
                  <SelectItem value="income">Income</SelectItem>
                </SelectContent>
              </Select>
              <input
                value={item.label}
                placeholder="Label"
                onChange={(event) =>
                  setOneOffs((current) =>
                    current.map((entry, position) =>
                      position === index ? { ...entry, label: event.target.value } : entry,
                    ),
                  )
                }
                aria-label={`Planned item ${index + 1} label`}
              />
              <input
                inputMode="decimal"
                placeholder="0.00"
                value={item.amountMinor === 0 ? '' : String(item.amountMinor / 100)}
                onChange={(event) => {
                  const parsed = Number.parseFloat(event.target.value)
                  const minor = Number.isNaN(parsed) ? 0 : Math.round(parsed * 100)
                  setOneOffs((current) =>
                    current.map((entry, position) =>
                      position === index ? { ...entry, amountMinor: Math.max(minor, 0) } : entry,
                    ),
                  )
                }}
                aria-label={`Planned item ${index + 1} amount`}
              />
              <Button
                variant="quiet"
                aria-label={`Remove planned item ${index + 1}`}
                onClick={() =>
                  setOneOffs((current) => current.filter((_, position) => position !== index))
                }
              >
                ✕
              </Button>
            </div>
          ))}
          <Button
            variant="quiet"
            onClick={() =>
              setOneOffs((current) => [
                ...current,
                { date: todayIso(3), direction: 'expense', label: '', amountMinor: 0 },
              ])
            }
          >
            + Plan an item
          </Button>
        </div>
        {oneOffs.length > 0 && !oneOffs.every(isValidOneOff) ? (
          <p className="field-error" role="status">
            Planned items need a date, label, and amount above zero.
          </p>
        ) : null}
      </Section>

      {forecastQuery.isLoading ? (
        <DataSkeleton />
      ) : forecastQuery.isError || !result ? (
        <ErrorState message="The forecast could not be calculated." retry={() => forecastQuery.refetch()} />
      ) : (
        <>
          <Section>
            <div className="section-heading-row">
              <div>
                <h2>Projected balance</h2>
                <p>
                  From {formatDate(result.startDate)} · {result.days} days
                </p>
              </div>
              {result.firstNegativeDate ? (
                <Badge tone="danger">
                  <TrendingDown size={14} aria-hidden="true" /> Negative from {formatDate(result.firstNegativeDate)}
                </Badge>
              ) : (
                <Badge tone="positive">
                  <TrendingUp size={14} aria-hidden="true" /> Stays positive
                </Badge>
              )}
            </div>
            <BalanceStrip result={result} currency={currency} onSelect={setSelectedDay} selected={selectedDay} />
            <dl className="forecast-stats">
              <div>
                <dt>Starting balance</dt>
                <dd>{formatMoney({ amountMinor: result.startingBalanceMinor, currency })}</dd>
              </div>
              <div>
                <dt>Lowest projected</dt>
                <dd>
                  {formatMoney({ amountMinor: result.lowestProjectedBalanceMinor, currency })}
                  {result.lowestProjectedDate ? (
                    <span className="forecast-stat-note"> on {formatDate(result.lowestProjectedDate)}</span>
                  ) : null}
                </dd>
              </div>
              <div>
                <dt>Expected income</dt>
                <dd>{formatMoney({ amountMinor: result.totals.expectedIncomeMinor, currency })}</dd>
              </div>
              <div>
                <dt>Expected spending</dt>
                <dd>{formatMoney({ amountMinor: result.totals.expectedExpenseMinor, currency })}</dd>
              </div>
            </dl>
          </Section>

          <Section>
            <details className="forecast-assumptions">
              <summary>
                <CalendarRange size={15} aria-hidden="true" /> How this was calculated
              </summary>
              <ul>
                {result.assumptions.map((assumption, index) => (
                  <li key={index}>{assumption}</li>
                ))}
                <li>
                  Scenario: bills {includeBills ? 'included' : 'excluded'} · typical spending{' '}
                  {includeBaseline ? 'included' : 'excluded'}
                  {includeBaseline ? ` (${result.baselineDailyExpenseMinor}/day)` : ''}.
                </li>
                {oneOffs.length > 0 ? (
                  <li>{oneOffs.length} planned items were added by you.</li>
                ) : null}
              </ul>
            </details>
          </Section>
        </>
      )}

      {selected ? (
        <Dialog
          open
          title={formatDate(selected.date)}
          description="Every number comes from these events."
          onClose={() => setSelectedDay(null)}
        >
          <DayDetail point={selected} currency={currency} onClose={() => setSelectedDay(null)} />
        </Dialog>
      ) : null}
    </PageFrame>
  )
}

function isValidOneOff(item: OneOffDraft) {
  return Boolean(item.date) && Boolean(item.label.trim()) && item.amountMinor > 0
}

function BalanceStrip({
  result,
  currency,
  onSelect,
  selected,
}: {
  result: ForecastResult
  currency: string
  onSelect: (date: string) => void
  selected: string | null
}) {
  const balances = result.points.map((point) => point.closingBalanceMinor)
  const maximum = Math.max(...balances, result.startingBalanceMinor, 0)
  const minimum = Math.min(...balances, result.startingBalanceMinor, 0)
  const span = maximum - minimum || 1
  const zeroRatio = (maximum - 0) / span
  return (
    <div>
      <div className="forecast-strip" role="listbox" aria-label="Projected balance by day">
        {result.points.map((point) => {
          const ratio = (maximum - point.closingBalanceMinor) / span
          const tone =
            point.closingBalanceMinor < 0 ? 'negative' : point.expenseMinor > point.incomeMinor ? 'spendy' : 'calm'
          return (
            <button
              key={point.date}
              role="option"
              aria-selected={selected === point.date}
              aria-label={`${formatDate(point.date)}, projected ${formatMoney({
                amountMinor: point.closingBalanceMinor,
                currency,
              })}`}
              className={`forecast-bar forecast-bar-${tone}`}
              style={{ top: `${ratio * 100}%` }}
              onClick={() => onSelect(point.date)}
            />
          )
        })}
        <span className="forecast-zero-line" style={{ top: `${zeroRatio * 100}%` }} aria-hidden="true" />
      </div>
      <p className="forecast-strip-caption visually-hidden">
        Lowest {formatMoney({ amountMinor: result.lowestProjectedBalanceMinor, currency })} on{' '}
        {result.lowestProjectedDate ?? '—'}. Highest{' '}
        {formatMoney({ amountMinor: Math.max(...balances), currency })}. Select a day for its events.
      </p>
    </div>
  )
}

function DayDetail({
  point,
  currency,
  onClose,
}: {
  point: ForecastPoint
  currency: string
  onClose: () => void
}) {
  return (
    <div className="forecast-day-detail">
      <p className="forecast-day-closing">
        Projected closing balance:{' '}
        <strong>{formatMoney({ amountMinor: point.closingBalanceMinor, currency })}</strong>
      </p>
      {point.events.length === 0 &&
      point.baselineExpenseMinor === 0 &&
      point.baselineIncomeMinor === 0 ? (
        <p>No expected activity.</p>
      ) : (
        <ul className="forecast-event-list">
          {point.events.map((event, index) => (
            <li key={index} data-direction={event.direction}>
              <strong>{event.label}</strong>
              <span>
                {event.kind === 'bill' ? 'Recurring bill' : 'Planned'} ·{' '}
                {event.direction === 'income' ? '+' : '−'}{' '}
                {formatMoney({ amountMinor: event.amountMinor, currency })}
                {event.frequency ? ` · ${event.frequency}` : ''}
              </span>
            </li>
          ))}
          {point.baselineExpenseMinor > 0 ? (
            <li data-direction="expense">
              <strong>Typical daily spending</strong>
              <span>
                − {formatMoney({ amountMinor: point.baselineExpenseMinor, currency })}
              </span>
            </li>
          ) : null}
          {point.baselineIncomeMinor > 0 ? (
            <li data-direction="income">
              <strong>Typical daily income</strong>
              <span>+ {formatMoney({ amountMinor: point.baselineIncomeMinor, currency })}</span>
            </li>
          ) : null}
        </ul>
      )}
      <Field label="Totals" hint="Income minus expenses applied to yesterday's projection.">
        <p className="forecast-day-total">
          +{formatMoney({ amountMinor: point.incomeMinor, currency })} income · −
          {formatMoney({ amountMinor: point.expenseMinor, currency })} spending
        </p>
      </Field>
      <Button variant="secondary" onClick={onClose}>Close</Button>
    </div>
  )
}
