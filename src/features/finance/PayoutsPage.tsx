import { Link } from '@tanstack/react-router'

import { ApprovalList } from './RefundsQueuePage'

/**
 * Money on its way out of the platform.
 *
 * Payouts are scheduled by the payment service and settled by its provider; nothing on
 * this screen moves one. What operations owns is the gate in front of a batch — the
 * second pair of eyes required before a run of driver payouts leaves (§11.3) — so that
 * is what this page is: the payout half of the approval queue, searched, filtered and
 * paged like the rest of it, and the ledger trail behind it.
 */
export function PayoutsPage() {
  return (
    <div className="max-w-4xl space-y-5">
      <header className="flex items-baseline justify-between gap-4">
        <h1 className="text-[22px] font-semibold leading-[28px]">Payouts</h1>

        <Link to="/ledger" className="text-[12px] text-fg-brand hover:underline">
          Ledgers
        </Link>
      </header>

      <section className="space-y-2">
        <h2 className="text-[15px] font-semibold">Payout approvals</h2>

        <ApprovalList actionPrefix="payout" exportName="orbit-payout-approvals.csv" />
      </section>

      <p className="max-w-2xl text-[12px] text-fg-tertiary">
        Batch history is not here yet. The payment service can schedule a payout but has no
        operation to list past batches, so this page shows the part operations acts on —
        the gate — rather than inventing a run history from ledger rows. Driver payable
        ledgers carry each payout as a posting.
      </p>
    </div>
  )
}
