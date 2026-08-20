import {
  ArrowRight,
  Bell,
  Bookmark,
  CalendarClock,
  ChevronRight,
  CircleHelp,
  CreditCard,
  FileText,
  Landmark,
  LockKeyhole,
  ReceiptText,
  Search,
  Settings,
  Share2,
  Target,
  TrendingUp,
  Users,
  WalletCards,
} from 'lucide-react'
import {
  motion,
  useReducedMotion,
} from 'motion/react'
import { useMemo, useState } from 'react'
import { SPRING_PRESS } from '@/lib/app-motion'
import { openExternalUrl } from '@/platform/external-links'
import {
  Button,
  PageHeader,
  Section,
} from '@/components/ui'

import {
  MotionLink,
  PageFrame,
} from './shared'

const HELP_TOPICS = [
  {
    icon: LockKeyhole,
    title: 'Privacy and security',
    copy: 'Visibility, application PIN, and sessions',
    keywords: 'privacy security pin device session sign in amounts',
    to: '/app/settings#settings-2',
  },
  {
    icon: WalletCards,
    title: 'Accounts and transactions',
    copy: 'Accounts, IDs, categories, transfers, and splits',
    keywords: 'account transaction id category transfer split entry expense income',
    to: '/app/settings?transactionSettings=categories#settings-5',
  },
  {
    icon: Users,
    title: 'Workspace members',
    copy: 'Invites, roles, and shared access',
    keywords: 'workspace member invite invitation role family shared access',
    to: '/app/family',
  },
  {
    icon: FileText,
    title: 'Office claims',
    copy: 'Receipts, approvals, and reimbursements',
    keywords: 'office claim receipt approval reimbursement expense',
    to: '/app/office',
  },
] as const

export function MorePage() {
  const reduce = useReducedMotion()
  return (
    <PageFrame className="mobile-more-page more-page support-page">
      <PageHeader title="More" description="All your tools and settings." />
      <Section className="share-center">
        <div className="share-center-heading">
          <span>
            <Share2 aria-hidden="true" />
          </span>
          <div>
            <small>Private sharing</small>
            <h2>Send a clean money update</h2>
            <p>
              Share a prepared summary through WhatsApp, your device share
              menu, or copy. Internal IDs and account details stay out.
            </p>
          </div>
        </div>
        <div className="share-center-links">
          {[
            [ReceiptText, 'Transaction snapshot', '/app/transactions'],
            [CalendarClock, 'Bill reminder', '/app/bills'],
            [TrendingUp, 'Monthly summary', '/app/insights'],
          ].map(([Icon, label, to], index) => (
            <MotionLink
              key={String(label)}
              to={String(to)}
              initial={reduce ? false : { opacity: 0, y: 7 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{
                duration: reduce ? 0 : 0.24,
                delay: reduce ? 0 : index * 0.04,
                ease: [0.16, 1, 0.3, 1],
              }}
              whileTap={reduce ? undefined : { scale: 0.96 }}
            >
              <Icon aria-hidden="true" />
              <strong>{String(label)}</strong>
              <ChevronRight aria-hidden="true" />
            </MotionLink>
          ))}
        </div>
      </Section>
      <Section>
        {[
          [WalletCards, 'Accounts', '/app/accounts'],
          [Users, 'Contacts', '/app/contacts'],
          [Bookmark, 'Saved names', '/app/saved-names'],
          [Target, 'Goals', '/app/goals'],
          [CreditCard, 'Bills', '/app/bills'],
          [TrendingUp, 'Insights', '/app/insights'],
          [Users, 'Members', '/app/family'],
          [Landmark, 'Office expenses', '/app/office'],
          [Bell, 'Notifications', '/app/notifications'],
          [Settings, 'Settings', '/app/settings'],
          [CircleHelp, 'Help and support', '/app/help'],
        ].map(([Icon, label, to]) => (
          <MotionLink
            className="more-link"
            key={String(label)}
            to={String(to)}
            whileTap={reduce ? undefined : { scale: 0.96 }}
            transition={reduce ? { duration: 0 } : SPRING_PRESS}
          >
            <span><Icon aria-hidden="true" /></span>
            <strong>{String(label)}</strong>
            <ChevronRight aria-hidden="true" />
          </MotionLink>
        ))}
      </Section>
    </PageFrame>
  )
}

export function HelpPage() {
  const reduce = useReducedMotion()
  const [query, setQuery] = useState('')
  const filteredTopics = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase()
    if (!normalized) return HELP_TOPICS
    return HELP_TOPICS.filter(({ title, copy, keywords }) =>
      `${title} ${copy} ${keywords}`.toLocaleLowerCase().includes(normalized),
    )
  }, [query])

  return (
    <PageFrame className="help-page support-page">
      <PageHeader title="Help and support" description="Answers without financial jargon." />
      <label className="help-search">
        <Search aria-hidden="true" />
        <input
          type="search"
          placeholder="Search help topics"
          aria-label="Search help topics"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </label>
      <div className="help-grid" aria-live="polite">
        {filteredTopics.map(({ icon: Icon, title, copy, to }, index) => (
          <motion.article
            key={title}
            initial={reduce ? false : { opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{
              duration: reduce ? 0 : 0.3,
              delay: reduce ? 0 : Math.min(index * 0.045, 0.2),
              ease: [0.16, 1, 0.3, 1],
            }}
          >
            <Icon aria-hidden="true" />
            <h2>{title}</h2>
            <p>{copy}</p>
            <MotionLink
              to={to}
              whileTap={reduce ? undefined : { scale: 0.97 }}
              transition={reduce ? { duration: 0 } : SPRING_PRESS}
            >
              Open guide <ArrowRight aria-hidden="true" />
            </MotionLink>
          </motion.article>
        ))}
        {filteredTopics.length === 0 ? (
          <div className="help-search-empty" role="status">
            <CircleHelp aria-hidden="true" />
            <strong>No matching help topic</strong>
            <span>Try “transactions”, “members”, “privacy”, or “claims”.</span>
          </div>
        ) : null}
      </div>
      <Section className="support-contact">
        <div>
          <h2>Still need help?</h2>
          <p>Contact support without including account numbers or sensitive values.</p>
        </div>
        <Button
          variant="secondary"
          onClick={() => {
            void openExternalUrl(
              'https://github.com/d4rkNinja/ledgerly-app/discussions',
            )
          }}
        >
          Open support discussions
        </Button>
      </Section>
    </PageFrame>
  )
}
