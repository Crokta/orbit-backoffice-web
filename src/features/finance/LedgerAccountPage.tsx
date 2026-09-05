import { Link, useParams } from '@tanstack/react-router'
import { useMemo, useState } from 'react'

import { Money } from '../../components/ui/Money'
import { api } from '../../lib/api/client'
import { dayBoundary, useDebounced, usePagedList, type Page } from '../../lib/paging'
import { queryKeys } from '../../lib/query/client'
import { LoadError } from '../../components/ui/LoadError'
import { DateRange, ExportButton, FilterSelect, ListToolbar, Pagination, SearchBox } from '../shared/ListControls'

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

interface PostingFilters {
  readonly account: string | undefined
  readonly q: string | undefined
  readonly direction: string | undefined
  readonly rideId: string | undefined
  readonly from: string | undefined
  readonly to: string | undefined
}

/**
 * One ledger's transactions, newest first — or, for the pseudo-account `all`, the whole
 * book.
 *
 * Debits and credits sit in separate columns, the way a ledger is read. One signed column
 * forces the reader to parse a minus sign on every row to work out which way the money
 * went.
 */
export function LedgerAccountPage() {
  const { account } = useParams({ from: '/authenticated/ledger/$account' })
  const wholeBook = account === 'all'

  const [search, setSearch] = useState('')
  const [direction, setDirection] = useState<'both' | 'debit' | 'credit'>('both')
  const [ride, setRide] = useState('')
  const [range, setRange] = useState({ from: '', to: '' })

  const q = useDebounced(search.trim())
  const rideId = useDebounced(ride.trim())

  const filters = useMemo<PostingFilters>(
    () => ({
      account: wholeBook ? undefined : account,
      q: q.length === 0 ? undefined : q,
      direction: direction === 'both' ? undefined : direction,
      rideId: rideId.length === 0 ? undefined : rideId,
      from: dayBoundary(range.from, 'start'),
      to: dayBoundary(range.to, 'end'),
    }),
    [wholeBook, account, q, direction, rideId, range],
  )

  const postings = usePagedList<Posting, PostingFilters>({
    key: [...queryKeys.ledger.all, 'postings'],
    filters,
    fetchPage: (params) => api.get<Page<Posting>>('/v1/admin/ledger/postings', { query: { ...params } }),
    initialLimit: 100,
  })

  return (
    <div className="space-y-4">
      <header>
        <Link to="/ledger" className="text-[12px] text-fg-brand hover:underline">← All ledgers</Link>
        <h1 className="tabular mt-1 text-[28px] font-semibold leading-[34px]">
          {wholeBook ? 'Every posting' : account}
        </h1>
        <p className="mt-1 text-[13px] text-fg-tertiary">
          {wholeBook
            ? 'The whole book, newest first. Narrow it with a search, a direction or a window.'
            : 'This ledger’s transactions, newest first.'}
        </p>
      </header>

      <ListToolbar actions={<ExportButton path="/v1/admin/ledger/postings/export.csv" query={{ ...filters }} filename={wholeBook ? 'orbit-ledger-postings.csv' : `orbit-ledger-${account.replaceAll(':', '-')}.csv`} />}>
        <SearchBox value={search} onChange={setSearch} placeholder={wholeBook ? 'Account, narrative, entry or ride id' : 'Narrative, entry or ride id'} />
        <FilterSelect
          label="Direction"
          value={direction}
          onChange={setDirection}
          options={[
            { value: 'both', label: 'Debits and credits' },
            { value: 'debit', label: 'Debits only' },
            { value: 'credit', label: 'Credits only' },
          ]}
        />
        <input
          type="search"
          value={ride}
          onChange={(event) => { setRide(event.target.value); }}
          placeholder="Ride id"
          aria-label="Filter by ride"
          className="h-9 w-40 rounded-md border border-line bg-surface px-3 text-[13px] placeholder:text-fg-tertiary"
        />
        <DateRange from={range.from} to={range.to} onChange={setRange} />
      </ListToolbar>

      <div className="overflow-x-auto rounded-lg border border-line-subtle bg-surface">
        <table className="w-full min-w-[840px] border-collapse text-[13px]">
          <thead>
            <tr className="border-b border-line-subtle">
              {['Entry', 'Account', 'Narrative', 'Ride', 'Posted'].map((header) => (
                <th
                  key={header}
                  scope="col"
                  className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-fg-tertiary"
                >
                  {header}
                </th>
              ))}
              <th scope="col" className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-wide text-fg-tertiary">
                Debit
              </th>
              <th scope="col" className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-wide text-fg-tertiary">
                Credit
              </th>
            </tr>
          </thead>

          <tbody>
            {postings.query.isError ? (
              <tr>
                <td colSpan={7} className="px-4 py-6">
                  <LoadError
                    error={postings.query.error}
                    what="the ledger"
                    onRetry={() => { void postings.query.refetch() }}
                  />
                </td>
              </tr>
            ) : postings.query.isPending ? (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-fg-tertiary">
                  Loading postings…
                </td>
              </tr>
            ) : postings.items.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-fg-tertiary">
                  No posting matches that.
                </td>
              </tr>
            ) : (
              postings.items.map((posting, index) => (
                <tr
                  key={`${posting.entryId}-${posting.account}-${String(index)}`}
                  className="border-b border-line-subtle last:border-0"
                >
                  <td className="tabular whitespace-nowrap px-4 py-3" title={posting.entryId}>
                    {posting.entryId.split('-')[0]}
                  </td>
                  <td className="tabular whitespace-nowrap px-4 py-3">
                    {wholeBook ? (
                      <Link to="/ledger/$account" params={{ account: posting.account }} className="text-fg-brand underline-offset-2 hover:underline">
                        {posting.account}
                      </Link>
                    ) : (
                      posting.account
                    )}
                  </td>
                  <td className="px-4 py-3 text-fg-secondary">{posting.narrative}</td>
                  <td className="tabular whitespace-nowrap px-4 py-3 text-fg-secondary">
                    {posting.rideId === null ? '—' : (
                      <Link to="/ride/$rideId" params={{ rideId: posting.rideId }} className="text-fg-brand underline-offset-2 hover:underline">
                        {posting.rideId}
                      </Link>
                    )}
                  </td>
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

      <Pagination list={postings} />
    </div>
  )
}
