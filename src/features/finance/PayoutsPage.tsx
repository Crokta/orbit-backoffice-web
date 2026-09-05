import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'

import { Money } from '../../components/ui/Money'
import { api } from '../../lib/api/client'
import { queryKeys } from '../../lib/query/client'

interface ApprovalRow {
  readonly requestId: string
  readonly action: string
  readonly resource: string
  readonly amountMinor: number | null
  readonly currency: string | null
  readonly requestedBy: string
  readonly justification: string
  readonly requestedAt: string
  readonly expiresAt: string
}

/**
 * Money on its way out of the platform.
 *
 * Payouts are scheduled by the payment service and settled by its provider; nothing on
 * this screen moves one. What operations owns is the gate in front of a batch — the
 * second pair of eyes required before a run of driver payouts leaves (§11.3) — so that
 * is what this page is: the payout half of the approval queue, and the ledger trail
 * behind it.
 */
export function PayoutsPage() {
  const queue = useQuery({
    queryKey: queryKeys.approvals.queue(),
    queryFn: () => api.get<readonly ApprovalRow[]>('/v1/admin/approvals'),
    refetchInterval: 30_000,
  })

  // The queue is shared with refunds and anything else needing four eyes. Narrowed here
  // rather than server-side because the endpoint returns everything pending and the
  // distinction is a property of the action, not of the queue.
  const payouts = queue.data?.filter((row) => row.action.toLowerCase().includes('payout'))

  return (
    <div className="space-y-5">
      <header className="flex items-baseline justify-between gap-4">
        <h1 className="text-[22px] font-semibold leading-[28px]">Payouts</h1>

        <Link to="/ledger" className="text-[12px] text-fg-brand hover:underline">
          Ledger postings
        </Link>
      </header>

      <section className="space-y-2">
        <h2 className="text-[15px] font-semibold">Awaiting a second approver</h2>

        {queue.isPending ? (
          <p className="rounded-xl border border-line-subtle bg-surface p-6 text-center text-[13px] text-fg-tertiary">
            Loading…
          </p>
        ) : payouts === undefined || payouts.length === 0 ? (
          <p className="rounded-xl border border-line-subtle bg-surface p-6 text-center text-[13px] text-fg-tertiary">
            No payout batch is waiting on an approval.
          </p>
        ) : (
          <ul className="divide-y divide-line-subtle overflow-hidden rounded-xl border border-line-subtle bg-surface">
            {payouts.map((row) => (
              <li key={row.requestId} className="px-4 py-3">
                <div className="flex items-baseline justify-between gap-4">
                  <p className="tabular truncate text-[13px] font-medium">{row.resource}</p>

                  {row.amountMinor !== null && row.currency !== null ? (
                    <Money minorUnits={row.amountMinor} currency={row.currency} />
                  ) : null}
                </div>

                <p className="mt-0.5 truncate text-[11px] text-fg-tertiary">
                  Raised by {row.requestedBy} · {row.justification}
                </p>
              </li>
            ))}
          </ul>
        )}

        {/* The decision itself lives on one screen, not two. A second place to approve
            the same request is a second place for the four-eyes rule to be got wrong. */}
        <p className="text-[12px] text-fg-tertiary">
          Approve or reject on the{' '}
          <Link to="/refunds" className="text-fg-brand hover:underline">
            approvals queue
          </Link>
          .
        </p>
      </section>

      <p className="max-w-2xl text-[12px] text-fg-tertiary">
        Batch history is not here yet. The payment service can schedule a payout but has no
        operation to list past batches, so this page shows the part operations acts on —
        the gate — rather than inventing a run history from ledger rows.
      </p>
    </div>
  )
}
