import { CircleHelp } from 'lucide-react'
import type { ComponentProps, ReactNode } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { Link } from 'react-router'
import { useApp } from '@/app/app-state'
import type { Money } from '@/domain/types'
import { formatMoney } from '@/lib/format'
import { Skeleton, SuccessNotice } from '@/components/ui'

const AnimatedLink = motion.create(Link)

export function MotionLink(props: ComponentProps<typeof AnimatedLink>) {
  return <AnimatedLink {...props} />
}

export type Feedback = {
  tone: 'success' | 'error' | 'info'
  message: string
}

export function PageFrame({
  children,
  className = '',
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <div className={`page-stack page-frame${className ? ` ${className}` : ''}`}>
      {children}
    </div>
  )
}

export function MotionListItem({
  children,
  index = 0,
  layout = false,
}: {
  children: ReactNode
  index?: number
  layout?: boolean
}) {
  const reduce = useReducedMotion()
  return (
    <motion.div
      layout={layout}
      initial={reduce ? false : { opacity: 0, y: 7 }}
      animate={{ opacity: 1, y: 0 }}
      exit={reduce ? { opacity: 0 } : { opacity: 0, x: -8 }}
      transition={{
        duration: reduce ? 0 : 0.26,
        delay: reduce ? 0 : Math.min(index * 0.035, 0.18),
        ease: [0.16, 1, 0.3, 1],
      }}
    >
      {children}
    </motion.div>
  )
}

export function InfoNotice({ children }: { children: ReactNode }) {
  const reduce = useReducedMotion()
  return (
    <motion.div
      className="inline-state"
      role="status"
      initial={reduce ? false : { opacity: 0, y: 5 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: reduce ? 0 : 0.24, ease: [0.16, 1, 0.3, 1] }}
    >
      <CircleHelp aria-hidden="true" />
      <div>
        <strong>Action unavailable</strong>
        <p>{children}</p>
      </div>
    </motion.div>
  )
}

export function FeedbackNotice({ feedback }: { feedback: Feedback }) {
  if (feedback.tone === 'success') {
    return <SuccessNotice>{feedback.message}</SuccessNotice>
  }
  if (feedback.tone === 'info') {
    return <InfoNotice>{feedback.message}</InfoNotice>
  }
  return (
    <div className="form-alert" role="alert">
      {feedback.message}
    </div>
  )
}

export function MoneyText({
  money,
  signed,
}: {
  money: Money
  signed?: 'credit' | 'debit'
}) {
  const { privacyMode } = useApp()
  return (
    <span className="money">
      {privacyMode ? '' : signed === 'credit' ? '+' : signed === 'debit' ? '-' : ''}
      {formatMoney(money, undefined, privacyMode)}
    </span>
  )
}

export function DataSkeleton() {
  return (
    <div
      className="data-skeleton"
      role="status"
      aria-label="Loading financial data"
    >
      <span className="sr-only">Loading financial data</span>
      <Skeleton className="skeleton-heading" />
      <Skeleton className="skeleton-block" />
      <Skeleton className="skeleton-row" />
      <Skeleton className="skeleton-row" />
      <Skeleton className="skeleton-row" />
    </div>
  )
}

export function Progress({
  value,
  label,
  tone = 'accent',
}: {
  value: number
  label: string
  tone?: 'accent' | 'warning'
}) {
  const reduce = useReducedMotion()
  const normalized = Number.isFinite(value)
    ? Math.max(0, Math.min(100, value))
    : 0
  return (
    <div className="progress-wrap">
      <div className="progress-meta">
        <span>{label}</span>
        <strong>{Math.round(normalized)}%</strong>
      </div>
      <div
        className="progress-track"
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={normalized}
      >
        <motion.span
          key={`${label}-${normalized}-${tone}`}
          className={tone}
          initial={reduce ? false : { scaleX: 0 }}
          animate={{ scaleX: normalized / 100 }}
          transition={{
            duration: reduce ? 0 : 0.55,
            ease: [0.16, 1, 0.3, 1],
          }}
        />
      </div>
    </div>
  )
}
