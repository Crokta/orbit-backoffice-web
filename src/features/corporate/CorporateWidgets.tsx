import { type ReactNode } from 'react'

import { cn } from '../../components/ui/cn'
import { type CompanyStatus, type InvoiceState, STATUS_LABEL, STATUS_STYLE } from './api'

/** One of the five tiles across the top of a corporate page. */
export function StatTile({
  label,
  value,
  delta,
  deltaTone = 'neutral',
  note,
  loading,
}: {
  readonly label: string
  readonly value: ReactNode
  readonly delta?: ReactNode
  readonly deltaTone?: 'up' | 'down' | 'neutral' | 'warning'
  readonly note?: ReactNode
  readonly loading?: boolean
}) {
  return (
    <div className="rounded-xl border border-line-subtle bg-surface p-4">
      <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-fg-tertiary">{label}</p>

      <p className="tabular mt-1.5 text-[26px] font-semibold leading-[32px]">
        {loading === true ? <span className="inline-block h-7 w-20 animate-pulse rounded bg-subtle" aria-label="Loading" /> : value}
      </p>

      {(delta !== undefined || note !== undefined) && (
        <p className="mt-1 flex items-center gap-1.5 text-[12px] text-fg-tertiary">
          {delta !== undefined && (
            <span
              className={cn(
                'tabular font-medium',
                deltaTone === 'up' && 'text-fg-success',
                deltaTone === 'down' && 'text-fg-danger',
                deltaTone === 'warning' && 'text-fg-warning',
              )}
            >
              {deltaTone === 'up' ? '▲ ' : deltaTone === 'down' ? '▼ ' : deltaTone === 'warning' ? '▲ ' : '— '}
              {delta}
            </span>
          )}
          {note}
        </p>
      )}
    </div>
  )
}

export function StatusBadge({ status }: { readonly status: CompanyStatus }) {
  return (
    <span className={cn('inline-flex items-center rounded-[4px] px-1.5 py-0.5 text-[11px] font-semibold leading-4', STATUS_STYLE[status])}>
      {STATUS_LABEL[status]}
    </span>
  )
}

export function InvoiceBadge({ state, overdueDays }: { readonly state: InvoiceState; readonly overdueDays: number }) {
  switch (state) {
    case 'paid':
      return <span className="inline-flex rounded-[4px] bg-success-subtle px-1.5 py-0.5 text-[11px] font-semibold text-fg-success">Paid</span>
    case 'overdue':
      return <span className="text-[12px] font-medium text-fg-danger">{overdueDays}d overdue</span>
    case 'due':
      return <span className="inline-flex rounded-[4px] bg-warning-subtle px-1.5 py-0.5 text-[11px] font-semibold text-fg-warning">Due</span>
    case 'voided':
      return <span className="inline-flex rounded-[4px] bg-subtle px-1.5 py-0.5 text-[11px] font-semibold text-fg-tertiary">Voided</span>
    default:
      return <span className="inline-flex rounded-[4px] bg-subtle px-1.5 py-0.5 text-[11px] font-semibold text-fg-tertiary">Not billed</span>
  }
}

/** A bordered section with a heading, as the account page is made of. */
export function Panel({
  title,
  subtitle,
  action,
  children,
  className,
}: {
  readonly title: string
  readonly subtitle?: string
  readonly action?: ReactNode
  readonly children: ReactNode
  readonly className?: string
}) {
  return (
    <section className={cn('rounded-xl border border-line-subtle bg-surface p-4', className)}>
      <header className="mb-3 flex items-start justify-between gap-4">
        <div>
          <h2 className="text-[15px] font-semibold leading-5">{title}</h2>
          {subtitle !== undefined && <p className="text-[12px] text-fg-tertiary">{subtitle}</p>}
        </div>
        {action}
      </header>
      {children}
    </section>
  )
}

/** A label/value row inside a panel. */
export function Row({
  label,
  value,
  tone = 'neutral',
  mono = false,
}: {
  readonly label: string
  readonly value: ReactNode
  readonly tone?: 'neutral' | 'warning' | 'danger' | 'success' | 'brand'
  readonly mono?: boolean
}) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-line-subtle py-2.5 last:border-0">
      <dt className="text-[13px] text-fg-secondary">{label}</dt>
      <dd
        className={cn(
          'text-right text-[13px] font-medium',
          mono && 'tabular',
          tone === 'warning' && 'text-fg-warning',
          tone === 'danger' && 'text-fg-danger',
          tone === 'success' && 'text-fg-success',
          tone === 'brand' && 'text-fg-brand',
        )}
      >
        {value}
      </dd>
    </div>
  )
}

export function Initials({ name }: { readonly name: string }) {
  const letters = name
    .split(/\s+/)
    .filter((part) => part.length > 0)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('')

  return (
    <span aria-hidden className="grid size-8 shrink-0 place-items-center rounded-full bg-subtle text-[11px] font-semibold text-fg-secondary">
      {letters.length === 0 ? '?' : letters}
    </span>
  )
}
