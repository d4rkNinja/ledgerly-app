import {
  AlertTriangle,
  Check,
  ChevronRight,
  LoaderCircle,
  WifiOff,
  X,
} from 'lucide-react'
import {
  Children,
  cloneElement,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  isValidElement,
  useEffect,
  useId,
  useRef,
  type ReactElement,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react'
import { createPortal } from 'react-dom'
import {
  AnimatePresence,
  motion,
  useReducedMotion,
  type HTMLMotionProps,
} from 'motion/react'
import {
  Button as BeUIButton,
  type ButtonProps as BeUIButtonProps,
} from '@/components/motion/button/base'
import { BottomSheet } from '@/components/motion/bottom-sheet'
import { isolateBodySiblings } from '@/lib/modal-isolation'
import { registerBackLayer } from '@/platform/back-layer-stack'
import {
  EASE_IN_OUT,
  MOTION_DISTANCE,
  SPRING_PANEL,
  TRANSITION_CONTENT,
  TRANSITION_FADE,
  TRANSITION_PANEL,
} from '@/lib/ease'
import { useMediaQuery } from '@/lib/hooks/use-media-query'
import { cn } from '@/lib/utils'

type FieldControlAria = {
  'aria-describedby'?: string
  'aria-invalid'?: boolean | 'true' | 'false'
  'aria-labelledby'?: string
  'data-field-control'?: string | boolean
  children?: ReactNode
  id?: string
}

type FieldControlInputProps = InputHTMLAttributes<HTMLInputElement> &
  FieldControlAria
type FieldControlSelectProps = SelectHTMLAttributes<HTMLSelectElement> &
  FieldControlAria
type FieldControlTextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement> &
  FieldControlAria
type FieldControlButtonProps = ButtonHTMLAttributes<HTMLButtonElement> &
  FieldControlAria
type FieldControlElement =
  | ReactElement<FieldControlInputProps, 'input'>
  | ReactElement<FieldControlSelectProps, 'select'>
  | ReactElement<FieldControlTextareaProps, 'textarea'>
  | ReactElement<FieldControlButtonProps, 'button'>

function isFieldControlElement(
  candidate: ReactNode,
): candidate is FieldControlElement {
  return (
    isValidElement(candidate) &&
    (candidate.type === 'input' ||
      candidate.type === 'select' ||
      candidate.type === 'textarea' ||
      candidate.type === 'button')
  )
}

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'button[data-field-control]:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

function getFocusableElements(root: HTMLElement | null) {
  if (!root) return []
  return Array.from(
    root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
  ).filter((element) => element.tabIndex >= 0)
}

function getInitialFocusElement(root: HTMLElement | null) {
  if (!root) return null

  const activeElement = document.activeElement
  if (
    activeElement instanceof HTMLElement &&
    root.contains(activeElement) &&
    !activeElement.hasAttribute('data-modal-close')
  ) {
    return activeElement
  }

  const focusable = getFocusableElements(root)
  return (
    focusable.find((element) => element.hasAttribute('autofocus')) ??
    focusable.find((element) => !element.hasAttribute('data-modal-close')) ??
    focusable[0] ??
    root
  )
}

function enhanceFieldControl(
  node: ReactNode,
  generatedControlId: string,
  labelId: string,
  messageId: string,
  error?: string,
  hint?: string,
): { controlId?: string; node: ReactNode } {
  let controlId: string | undefined

  const enhanceNode = (candidate: ReactNode): ReactNode => {
    if (!isFieldControlElement(candidate)) {
      return candidate
    }

    const element = candidate
    const elementProps = element.props
    const isFieldInput =
      element.type === 'input' ||
      element.type === 'select' ||
      element.type === 'textarea'
    const isLabeledButton =
      element.type === "button" &&
      elementProps['data-field-control'] !== undefined

    if (isFieldInput || isLabeledButton) {
      const isLabelTarget = controlId === undefined
      if (isLabelTarget) {
        controlId = elementProps.id?.trim()
          ? elementProps.id
          : generatedControlId
      }

      const controlProps = {
        id: isLabelTarget ? controlId : elementProps.id,
        'aria-invalid': error ? true : elementProps['aria-invalid'],
        'aria-labelledby':
          [elementProps['aria-labelledby'], labelId]
            .filter(Boolean)
            .join(' ') || undefined,
        'aria-describedby':
          [
            elementProps['aria-describedby'],
            error || hint ? messageId : undefined,
          ]
            .filter(Boolean)
            .join(' ') || undefined,
      }

      if (element.type === 'input') {
        return cloneElement(
          element as ReactElement<FieldControlInputProps, 'input'>,
          controlProps,
        )
      }

      if (element.type === 'select') {
        return cloneElement(
          element as ReactElement<FieldControlSelectProps, 'select'>,
          controlProps,
        )
      }

      if (element.type === 'textarea') {
        return cloneElement(
          element as ReactElement<FieldControlTextareaProps, 'textarea'>,
          controlProps,
        )
      }

      return cloneElement(
        element as ReactElement<FieldControlButtonProps, 'button'>,
        controlProps,
      )
    }

    if (elementProps.children) {
      return cloneElement(
        element,
        undefined,
        Children.map(elementProps.children, enhanceNode),
      )
    }

    return element
  }

  const enhancedNode = enhanceNode(node)
  return { controlId, node: enhancedNode }
}

export function Button({
  className,
  variant = 'primary',
  loading,
  children,
  ...props
}: Omit<BeUIButtonProps, 'variant' | 'size'> & {
  variant?: 'primary' | 'secondary' | 'quiet' | 'danger'
  loading?: boolean
}) {
  const beuiVariant =
    variant === 'quiet'
      ? 'ghost'
      : variant === 'danger'
        ? 'outline'
        : variant

  return (
    <BeUIButton
      variant={beuiVariant}
      size="md"
      pressScale={0.985}
      ripple={variant === 'primary'}
      className={cn('button', `button-${variant}`, className)}
      {...props}
      disabled={loading || props.disabled}
      aria-busy={loading || undefined}
    >
      {loading ? (
        <LoaderCircle className="spin button-loader" aria-hidden="true" />
      ) : null}
      {children}
    </BeUIButton>
  )
}

export function IconButton({
  label,
  className,
  children,
  ...props
}: Omit<BeUIButtonProps, 'variant' | 'size' | 'children'> & {
  label: string
  children: ReactNode
}) {
  return (
    <BeUIButton
      variant="ghost"
      size="icon"
      pressScale={0.97}
      className={cn('icon-button', className)}
      {...props}
      aria-label={label}
      title={label}
    >
      {children}
    </BeUIButton>
  )
}

export function Field({
  label,
  hint,
  error,
  children,
}: {
  label: string
  hint?: string
  error?: string
  children: ReactNode
}) {
  const reduce = useReducedMotion()
  const labelId = useId()
  const messageId = useId()
  const generatedControlId = useId()
  const fieldControl = enhanceFieldControl(
    children,
    generatedControlId,
    labelId,
    messageId,
    error,
    hint,
  )
  return (
    <div className="field">
      <label id={labelId} htmlFor={fieldControl.controlId}>
        {label}
      </label>
      {fieldControl.node}
      <AnimatePresence initial={false} mode="wait">
        {error ? (
          <motion.small
            id={messageId}
            key="error"
            className="field-error"
            role="alert"
            initial={reduce ? { opacity: 0 } : { opacity: 0, y: -3 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, y: -3 }}
            transition={reduce ? { duration: 0 } : TRANSITION_FADE}
          >
            {error}
          </motion.small>
        ) : hint ? (
          <motion.small
            id={messageId}
            key="hint"
            initial={reduce ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={reduce ? { duration: 0 } : TRANSITION_FADE}
          >
            {hint}
          </motion.small>
        ) : null}
      </AnimatePresence>
    </div>
  )
}

export function Badge({
  tone = 'neutral',
  children,
}: {
  tone?: 'neutral' | 'positive' | 'warning' | 'danger'
  children: ReactNode
}) {
  const reduce = useReducedMotion()
  return (
    <motion.span
      initial={reduce ? false : { opacity: 0, scale: 0.92 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={reduce ? { duration: 0 } : SPRING_PANEL}
      className={cn('badge', `badge-${tone}`)}
    >
      {children}
    </motion.span>
  )
}

export function EmptyState({
  icon,
  title,
  message,
  action,
}: {
  icon?: ReactNode
  title: string
  message: string
  action?: ReactNode
}) {
  const reduce = useReducedMotion()
  return (
    <motion.div
      className="state-panel"
      initial={
        reduce
          ? false
          : { opacity: 0, y: MOTION_DISTANCE.panel }
      }
      animate={{ opacity: 1, y: 0 }}
      transition={reduce ? { duration: 0 } : TRANSITION_PANEL}
    >
      <motion.div
        className="state-icon"
        aria-hidden="true"
        initial={reduce ? false : { opacity: 0, scale: 0.94 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={reduce ? { duration: 0 } : SPRING_PANEL}
      >
        {icon}
      </motion.div>
      <h2>{title}</h2>
      <p>{message}</p>
      {action}
    </motion.div>
  )
}

export function ErrorState({
  message,
  retry,
}: {
  message: string
  retry?: () => void
}) {
  const reduce = useReducedMotion()
  return (
    <motion.div
      className="inline-state error-state"
      role="alert"
      initial={
        reduce
          ? false
          : { y: MOTION_DISTANCE.content }
      }
      animate={{ opacity: 1, y: 0 }}
      transition={reduce ? { duration: 0 } : TRANSITION_CONTENT}
    >
      <AlertTriangle aria-hidden="true" />
      <div>
        <strong>We could not load this</strong>
        <p>{message}</p>
      </div>
      {retry ? (
        <Button variant="secondary" onClick={retry}>
          Try again
        </Button>
      ) : null}
    </motion.div>
  )
}

export function OfflineBanner() {
  const reduce = useReducedMotion()
  return (
    <motion.div
      className="offline-banner"
      role="status"
      initial={reduce ? false : { y: -MOTION_DISTANCE.panel, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      exit={reduce ? undefined : { y: -MOTION_DISTANCE.panel, opacity: 0 }}
      transition={reduce ? { duration: 0 } : TRANSITION_CONTENT}
    >
      <WifiOff aria-hidden="true" />
      You are offline. Viewing the last available data.
    </motion.div>
  )
}

export function Skeleton({ className }: { className?: string }) {
  const reduce = useReducedMotion()
  return (
    <motion.div
      className={cn('skeleton', className)}
      aria-hidden="true"
      initial={false}
      animate={reduce ? undefined : { opacity: [0.58, 1, 0.58] }}
      transition={
        reduce
          ? { duration: 0 }
          : {
              duration: 1.35,
              ease: EASE_IN_OUT,
              repeat: Number.POSITIVE_INFINITY,
            }
      }
    />
  )
}

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: string
  title: string
  description?: string
  actions?: ReactNode
}) {
  const reduce = useReducedMotion()
  return (
    <motion.header
      className="page-header"
      initial={
        reduce
          ? false
          : { y: MOTION_DISTANCE.content }
      }
      animate={{ opacity: 1, y: 0 }}
      transition={reduce ? { duration: 0 } : TRANSITION_CONTENT}
    >
      <div>
        {eyebrow ? <span className="page-eyebrow">{eyebrow}</span> : null}
        <h1>{title}</h1>
        {description ? <p>{description}</p> : null}
      </div>
      {actions ? <div className="page-actions">{actions}</div> : null}
    </motion.header>
  )
}

export function ListRow({
  leading,
  title,
  subtitle,
  trailing,
  onClick,
}: {
  leading?: ReactNode
  title: string
  subtitle?: string
  trailing?: ReactNode
  onClick?: () => void
}) {
  const reduce = useReducedMotion()
  const content = (
    <>
      {leading ? <div className="row-leading">{leading}</div> : null}
      <div className="row-copy">
        <strong>{title}</strong>
        {subtitle ? <span>{subtitle}</span> : null}
      </div>
      {trailing ? <div className="row-trailing">{trailing}</div> : null}
      {onClick ? <ChevronRight className="row-chevron" aria-hidden="true" /> : null}
    </>
  )
  return onClick ? (
    <motion.button
      type="button"
      className="list-row list-row-button"
      onClick={onClick}
      layout={reduce ? false : 'position'}
      initial={
        reduce
          ? false
          : { opacity: 0, y: MOTION_DISTANCE.content / 2 }
      }
      animate={{ opacity: 1, y: 0 }}
      whileTap={reduce ? undefined : { scale: 0.985 }}
      transition={reduce ? { duration: 0 } : TRANSITION_FADE}
    >
      {content}
    </motion.button>
  ) : (
    <motion.div
      className="list-row"
      layout={reduce ? false : 'position'}
      initial={
        reduce
          ? false
          : { opacity: 0, y: MOTION_DISTANCE.content / 2 }
      }
      animate={{ opacity: 1, y: 0 }}
      transition={reduce ? { duration: 0 } : TRANSITION_FADE}
    >
      {content}
    </motion.div>
  )
}

type DialogProps = {
  open: boolean
  title: string
  description?: string
  onClose: () => void
  children: ReactNode
}

function DesktopDialog({
  open,
  title,
  description,
  onClose,
  children,
}: DialogProps) {
  const reduce = useReducedMotion()
  const dialogId = useId()
  const layerRef = useRef<HTMLDivElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const previousFocusRef = useRef<HTMLElement | null>(null)
  const onCloseRef = useRef(onClose)

  useEffect(() => {
    onCloseRef.current = onClose
  }, [onClose])
  useEffect(() => {
    if (!open) return
    return registerBackLayer(() => onCloseRef.current())
  }, [open])


  useEffect(() => {
    if (!open) return

    previousFocusRef.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null

    const body = document.body
    const previousOverflow = body.style.overflow
    const previousPaddingRight = body.style.paddingRight
    const scrollbarWidth =
      Math.max(0, window.innerWidth - document.documentElement.clientWidth)

    body.style.overflow = 'hidden'
    if (scrollbarWidth > 0) {
      body.style.paddingRight = `${scrollbarWidth}px`
    }

    let restoreIsolation = () => {}
    const focusFrame = requestAnimationFrame(() => {
      if (layerRef.current) {
        restoreIsolation = isolateBodySiblings(layerRef.current)
      }
      getInitialFocusElement(panelRef.current)?.focus()
    })

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onCloseRef.current()
        return
      }

      if (event.key !== 'Tab') return
      const focusable = getFocusableElements(panelRef.current)
      if (!focusable.length) {
        event.preventDefault()
        panelRef.current?.focus()
        return
      }

      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => {
      cancelAnimationFrame(focusFrame)
      document.removeEventListener('keydown', handleKeyDown)
      body.style.overflow = previousOverflow
      body.style.paddingRight = previousPaddingRight
      restoreIsolation()
      const previousFocus = previousFocusRef.current
      if (
        previousFocus?.isConnected &&
        !previousFocus.closest('[inert]')
      ) {
        previousFocus.focus()
      }
    }
  }, [open])

  if (typeof document === 'undefined') return null

  return createPortal(
    <AnimatePresence>
      {open ? (
        <motion.div
          ref={layerRef}
          className="app-dialog-layer"
          initial={false}
          role="presentation"
        >
          <motion.button
            type="button"
            className="app-dialog-backdrop"
            aria-label="Dismiss dialog"
            tabIndex={-1}
            onClick={onClose}
            initial={reduce ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={reduce ? undefined : { opacity: 0 }}
            transition={reduce ? { duration: 0 } : TRANSITION_FADE}
          />
          <motion.div
            ref={panelRef}
            className="app-dialog-surface app-morph-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby={`${dialogId}-title`}
            aria-describedby={
              description ? `${dialogId}-description` : undefined
            }
            tabIndex={-1}
            initial={
              reduce
                ? false
                : {
                    opacity: 0,
                    y: MOTION_DISTANCE.panel,
                    scale: 0.985,
                  }
            }
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={
              reduce
                ? undefined
                : {
                    opacity: 0,
                    y: MOTION_DISTANCE.content,
                    scale: 0.99,
                  }
            }
            transition={reduce ? { duration: 0 } : TRANSITION_PANEL}
          >
            <header className="dialog-motion-header">
              <div>
                <h2 id={`${dialogId}-title`}>{title}</h2>
                {description ? (
                  <p id={`${dialogId}-description`}>{description}</p>
                ) : null}
              </div>
              <IconButton
                label="Close dialog"
                data-modal-close=""
                onClick={onClose}
              >
                <X aria-hidden="true" />
              </IconButton>
            </header>
            <div className="dialog-motion-content">{children}</div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>,
    document.body,
  )
}

export function Dialog({
  open,
  title,
  description,
  onClose,
  children,
}: DialogProps) {
  const mobile = useMediaQuery('(max-width: 680px)')

  if (mobile) {
    return (
      <BottomSheet
        open={open}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) onClose()
        }}
        snapPoints={['auto']}
        title={title}
        description={description}
        className="app-dialog-surface app-bottom-sheet"
      >
        <div className="sheet-dialog-content">{children}</div>
      </BottomSheet>
    )
  }

  return (
    <DesktopDialog
      open={open}
      title={title}
      description={description}
      onClose={onClose}
    >
      {children}
    </DesktopDialog>
  )
}

export function SuccessNotice({ children }: { children: ReactNode }) {
  const reduce = useReducedMotion()
  return (
    <motion.div
      className="success-notice"
      role="status"
      initial={
        reduce
          ? false
          : { opacity: 0, y: MOTION_DISTANCE.content, scale: 0.985 }
      }
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={reduce ? { duration: 0 } : TRANSITION_CONTENT}
    >
      <Check aria-hidden="true" />
      {children}
    </motion.div>
  )
}

export function Section({
  className,
  ...props
}: Omit<HTMLMotionProps<'section'>, 'ref'>) {
  const reduce = useReducedMotion()
  return (
    <motion.section
      className={cn('surface-section', className)}
      initial={
        reduce
          ? false
          : { y: MOTION_DISTANCE.content }
      }
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.12 }}
      transition={reduce ? { duration: 0 } : TRANSITION_CONTENT}
      {...props}
    />
  )
}
