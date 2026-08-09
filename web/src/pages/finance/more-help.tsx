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
import { SPRING_PRESS } from '@/lib/ease'
import {
  Button,
  PageHeader,
  Section,
} from '@/components/ui'

import {
  MotionLink,
  PageFrame,
} from './shared'

export function MorePage() {
  const reduce = useReducedMotion()
  return (
    <PageFrame className="mobile-more-page">
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
              whileTap={reduce ? undefined : { scale: 0.985 }}
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
            whileTap={reduce ? undefined : { scale: 0.985 }}
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
  return (
    <PageFrame>
      <PageHeader title="Help and support" description="Answers without financial jargon." />
      <label className="help-search">
        <Search aria-hidden="true" />
        <input
          placeholder="Help search is not connected yet"
          aria-label="Help search is not connected yet"
          disabled
        />
      </label>
      <div className="help-grid">
        {[
          [LockKeyhole, 'Privacy and security', 'Visibility, application PIN, and sessions'],
          [WalletCards, 'Accounts and transactions', 'Imports, categories, transfers, and splits'],
          [Users, 'Workspace members', 'Invites, roles, and shared access'],
          [FileText, 'Office claims', 'Receipts, approvals, and reimbursements'],
        ].map(([Icon, title, copy], index) => (
          <motion.article
            key={String(title)}
            initial={reduce ? false : { opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{
              duration: reduce ? 0 : 0.3,
              delay: reduce ? 0 : Math.min(index * 0.045, 0.2),
              ease: [0.16, 1, 0.3, 1],
            }}
          >
            <Icon aria-hidden="true" />
            <h2>{String(title)}</h2>
            <p>{String(copy)}</p>
            <button
              type="button"
              disabled
              title="Help articles are not connected yet"
            >
              View articles <ArrowRight aria-hidden="true" />
            </button>
          </motion.article>
        ))}
      </div>
      <Section className="support-contact">
        <div>
          <h2>Still need help?</h2>
          <p>Contact support without including account numbers or sensitive values.</p>
        </div>
        <Button
          variant="secondary"
          disabled
          title="Support contact is not connected yet"
        >
          Contact support
        </Button>
      </Section>
    </PageFrame>
  )
}
