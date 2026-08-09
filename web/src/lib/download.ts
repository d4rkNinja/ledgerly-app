import type { Bill, Transaction } from '@/domain/types'

function safeFilename(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64)
}

function escapeCsv(value: string | number) {
  const text = String(value)
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text
}

export function downloadTextFile(
  filename: string,
  content: string,
  mimeType = 'text/plain;charset=utf-8',
) {
  const blob = new Blob([content], { type: mimeType })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.rel = 'noopener'
  document.body.append(anchor)
  anchor.click()
  anchor.remove()
  // WebKit may not begin reading the object URL until after the click task.
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000)
}

export function downloadTransactionsCsv(
  transactions: Transaction[],
  workspaceName: string,
  concealAmounts: boolean,
) {
  const rows = [
    ['Date', 'Direction', 'Merchant', 'Category', 'Status', 'Amount', 'Currency'],
    ...transactions.map((transaction) => [
      new Date(transaction.occurredAt).toISOString().slice(0, 10),
      transaction.direction,
      transaction.merchant,
      transaction.category,
      transaction.status,
      concealAmounts ? 'Hidden by privacy mode' : transaction.amount.amountMinor / 100,
      transaction.amount.currency,
    ]),
  ]
  const csv = rows.map((row) => row.map(escapeCsv).join(',')).join('\r\n')
  const base = safeFilename(workspaceName) || 'ledgerly'
  downloadTextFile(
    `${base}-transactions.csv`,
    `\uFEFF${csv}`,
    'text/csv;charset=utf-8',
  )
}

function escapeCalendarText(value: string) {
  return value
    .replaceAll('\\', '\\\\')
    .replaceAll('\n', '\\n')
    .replaceAll(',', '\\,')
    .replaceAll(';', '\\;')
}

function calendarDate(value: string) {
  const date = new Date(value)
  const year = date.getUTCFullYear()
  const month = String(date.getUTCMonth() + 1).padStart(2, '0')
  const day = String(date.getUTCDate()).padStart(2, '0')
  return `${year}${month}${day}`
}

export function downloadBillCalendarEvent(
  bill: Bill,
  formattedAmount?: string,
) {
  const start = calendarDate(bill.dueDate)
  const nextDay = new Date(bill.dueDate)
  nextDay.setUTCDate(nextDay.getUTCDate() + 1)
  const end = calendarDate(nextDay.toISOString())
  const details = [
    `${bill.name} is due.`,
    formattedAmount ? `Amount: ${formattedAmount}.` : '',
    bill.autopay
      ? 'Autopay is enabled. Confirm the account has enough funds.'
      : 'Manual payment is needed.',
  ]
    .filter(Boolean)
    .join(' ')
  const event = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Ledgerly//Bill Reminder//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:bill-${crypto.randomUUID()}@ledgerly.local`,
    `DTSTART;VALUE=DATE:${start}`,
    `DTEND;VALUE=DATE:${end}`,
    `SUMMARY:${escapeCalendarText(`${bill.name} payment due`)}`,
    `DESCRIPTION:${escapeCalendarText(details)}`,
    'BEGIN:VALARM',
    'TRIGGER:-P1D',
    'ACTION:DISPLAY',
    `DESCRIPTION:${escapeCalendarText(`${bill.name} is due tomorrow`)}`,
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
    '',
  ].join('\r\n')
  downloadTextFile(
    `${safeFilename(bill.name) || 'bill'}-reminder.ics`,
    event,
    'text/calendar;charset=utf-8',
  )
}
