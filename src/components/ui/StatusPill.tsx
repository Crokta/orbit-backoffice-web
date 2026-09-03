import { cn } from './cn'

/** The ride and driver states the console displays. */
export type Status =
  | 'online'
  | 'offline'
  | 'in-trip'
  | 'cancelled'
  | 'arrears'
  | 'pending'
  | 'approved'
  | 'rejected'

const STYLES: Record<Status, string> = {
  // Straight off the Figma status ramp. Colour is never the only signal — each pill
  // also carries its label — because roughly one in twelve men cannot reliably tell
  // the green from the amber.
  online: 'bg-success-subtle text-fg-success',
  offline: 'bg-subtle text-fg-tertiary',
  'in-trip': 'bg-brand-subtle text-fg-brand',
  cancelled: 'bg-danger-subtle text-fg-danger',
  arrears: 'bg-warning-subtle text-fg-warning',
  pending: 'bg-warning-subtle text-fg-warning',
  approved: 'bg-success-subtle text-fg-success',
  rejected: 'bg-danger-subtle text-fg-danger',
}

const LABELS: Record<Status, string> = {
  online: 'Online',
  offline: 'Offline',
  'in-trip': 'In trip',
  cancelled: 'Cancelled',
  arrears: 'In arrears',
  pending: 'Pending',
  approved: 'Approved',
  rejected: 'Rejected',
}

export function StatusPill({ status, className }: { readonly status: Status; readonly className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold',
        STYLES[status],
        className,
      )}
    >
      <span className="size-1.5 rounded-full bg-current" aria-hidden="true" />
      {LABELS[status]}
    </span>
  )
}
