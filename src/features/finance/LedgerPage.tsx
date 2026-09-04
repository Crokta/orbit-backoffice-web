import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { useState } from 'react'

import { Money } from '../../components/ui/Money'
import { api } from '../../lib/api/client'
import { queryKeys } from '../../lib/query/client'
import { LoadError } from '../../components/ui/LoadError'

interface Posting {
  readonly entryId: string
  readonly account: string
  readonly direction: 'debit' | 'credit'
  readonly amountMinor: number
  readonly currency: string
  readonly rideId: string | null
  readonly postedAt: string
  readonly narrative: string
}

interface Page<T> {
  readonly items: readonly T[]
  readonly nextCursor: string | null
}

/**
 * The double-entry ledger (architecture §12.1).
 *
 * Read-only, and there is no route anywhere in this console that writes to it. Balances
 * are derived from postings, never stored, and a screen that could adjust one directly
 * would break the property the whole subsystem rests on.
 */
export function LedgerPage() {
  const [account, setAccount] = useState('')

  const postings = useQuery({
    queryKey: [...queryKeys.ledger.all, account],
    queryFn: () =>
      api.get<Page<Posting>>('/v1/admin/ledger/postings', { query: { account: account || undefined, limit: 100 } }),
    placeholderData: keepPreviousData,
  })

  return (
    <div className="space-y-4">
      <h1 className="text-[28px] font-semibold leading-[34px]">Ledger</h1>

      <input
        value={account}
        onChange={(event) => { setAccount(event.target.value); }}
        placeholder="Account, e.g. driver:drv_88ff or platform:commission"
        aria-label="Filter by account"
        className="tabular h-9 w-full max-w-md rounded-md border border-line bg-surface px-3 text-[13px]"
      />

      <div className="overflow-x-auto rounded-lg border border-line-subtle bg-surface">
        <table className="w-full min-w-[840px] border-collapse text-[13px]">
          <thead>
            <tr className="border-b border-line-subtle">
              {['Entry', 'Account', 'Narrative', 'Posted'].map((header) => (
                <th
                  key={header}
                  scope="col"
                  className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-fg-tertiary"
                >
                  {header}
                </th>
              ))}

              {/* Debits and credits in separate columns, the way a ledger is read.
                  One signed column forces the reader to parse a minus sign on every
                  row to work out which way the money went. */}
              <th scope="col" className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-wide text-fg-tertiary">
                Debit
              </th>
              <th scope="col" className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-wide text-fg-tertiary">
                Credit
              </th>
            </tr>
          </thead>

          <tbody>
            {postings.isError ? (
              <tr>
                <td colSpan={6} className="px-4 py-6">
                  <LoadError
                    error={postings.error}
                    what="the ledger"
                    onRetry={() => { void postings.refetch() }}
                  />
                </td>
              </tr>
            ) : postings.isPending ? (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-fg-tertiary">
                  Loading postings…
                </td>
              </tr>
            ) : (
              postings.data.items.map((posting, index) => (
                <tr
                  key={`${posting.entryId}-${String(index)}`}
                  className="border-b border-line-subtle last:border-0"
                >
                  <td className="tabular whitespace-nowrap px-4 py-3" title={posting.entryId}>
                    {posting.entryId.split('-')[0]}
                  </td>
                  <td className="tabular whitespace-nowrap px-4 py-3">{posting.account}</td>
                  <td className="px-4 py-3 text-fg-secondary">{posting.narrative}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-fg-secondary">
                    {new Date(posting.postedAt).toLocaleString('en-NG')}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {posting.direction === 'debit' ? (
                      <Money minorUnits={posting.amountMinor} currency={posting.currency} />
                    ) : null}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {posting.direction === 'credit' ? (
                      <Money minorUnits={posting.amountMinor} currency={posting.currency} />
                    ) : null}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
