import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { useMemo, useState } from 'react'

import { LoadError } from '../../components/ui/LoadError'
import { Money } from '../../components/ui/Money'
import { cn } from '../../components/ui/cn'
import { formatDuration } from '../../lib/format'
import { useDebounced, usePagedList } from '../../lib/paging'
import { StatTile } from '../corporate/CorporateWidgets'
import { Chips, ExportButton, FilterSelect, ListToolbar, Pagination, SearchBox } from '../shared/ListControls'
import { DeliveryStatePill, ExceptionFlags, RouteCell, TierBadge } from './DeliveryWidgets'
import { DELIVERY_STATES, type DeliveryCounts, type DeliveryListFilters, type DeliveryState, STATE_LABEL, type Tier, deliveryApi, deliveryKeys } from './api'

type StateChip = 'all' | 'active' | DeliveryState

const STATE_CHIPS: readonly { readonly value: StateChip; readonly label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'active', label: 'Active' },
  ...DELIVERY_STATES.map((state) => ({ value: state, label: STATE_LABEL[state] })),
]

const TIER_OPTIONS: readonly { readonly value: Tier | 'all'; readonly label: string }[] = [
  { value: 'all', label: 'All tiers' },
  { value: 'Bike', label: 'Bike' },
  { value: 'Van', label: 'Van' },
  { value: 'Truck', label: 'Truck' },
]

const HEADERS = ['Reference', 'State', 'In state', 'Courier', 'Vehicle', 'Tier', 'Route', 'Flags', 'Fare'] as const

/** The board polls every ten seconds. A delivery that has been stuck for a minute should say so within one. */
const BOARD_INTERVAL_MS = 10_000

/**
 * The live deliveries board (REQ121).
 *
 * Mirrors the rides list: every active delivery, its state, how long it has been there, who
 * has it and on what, and the flags an operator scans for. The order is the server's — time
 * in state, longest first — and it is measured on the server too, so two rows are never
 * compared against two different clocks.
 */
export function DeliveriesPage() {
  const [state, setState] = useState<StateChip>('active')
  const [tier, setTier] = useState<Tier | 'all'>('all')
  const [search, setSearch] = useState('')

  const q = useDebounced(search.trim())

  const filters = useMemo<DeliveryListFilters>(
    () => ({
      state: state === 'all' ? undefined : state,
      q: q.length === 0 ? undefined : q,
      tier: tier === 'all' ? undefined : tier,
      exceptions: undefined,
    }),
    [state, q, tier],
  )

  const list = usePagedList({
    key: deliveryKeys.list(),
    filters,
    fetchPage: (params) => deliveryApi.list(params),
    refetchInterval: BOARD_INTERVAL_MS,
  })

  const counts = useQuery({ queryKey: deliveryKeys.counts(), queryFn: deliveryApi.counts, refetchInterval: BOARD_INTERVAL_MS })

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-[22px] font-semibold leading-[28px]">Deliveries</h1>
          <p className="mt-0.5 text-[13px] text-fg-secondary">Every parcel in flight, longest in its state first. Refreshes every ten seconds.</p>
        </div>

        <div className="flex items-center gap-4">
          <Link to="/deliveries/exceptions" className="text-[13px] font-medium text-fg-brand hover:underline">
            Exceptions queue →
          </Link>
          <Link to="/deliveries/claims" className="text-[13px] font-medium text-fg-brand hover:underline">
            Claims →
          </Link>
        </div>
      </header>

      <CountTiles data={counts.data} loading={counts.isPending} onPick={setState} />

      <section className="space-y-2">
        <ListToolbar
          actions={
            <ExportButton
              path="/v1/admin/deliveries/export.csv"
              query={{ state: filters.state, q: filters.q, tier: filters.tier }}
              filename="orbit-deliveries.csv"
            />
          }
        >
          <SearchBox value={search} onChange={setSearch} placeholder="Reference, sender, courier, plate or address" className="w-80" />
          <FilterSelect label="Filter by tier" value={tier} options={TIER_OPTIONS} onChange={setTier} />
        </ListToolbar>

        <Chips<StateChip> label="Delivery state" value={state} options={STATE_CHIPS} onChange={setState} />

        {list.query.isError ? (
          <LoadError error={list.query.error} what="the deliveries board" onRetry={() => { void list.query.refetch() }} />
        ) : (
          <div className="overflow-x-auto rounded-xl border border-line-subtle bg-surface">
            <table className="w-full min-w-[1080px] border-collapse text-[13px]">
              <thead>
                <tr className="border-b border-line-subtle">
                  {HEADERS.map((header, index) => (
                    <th
                      key={header}
                      scope="col"
                      className={cn(
                        'px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-fg-tertiary',
                        index === HEADERS.length - 1 && 'text-right',
                      )}
                    >
                      {header}
                    </th>
                  ))}
                </tr>
              </thead>

              <tbody>
                {list.query.isPending ? (
                  <tr><td colSpan={HEADERS.length} className="px-4 py-10 text-center text-fg-tertiary">Loading…</td></tr>
                ) : list.items.length === 0 ? (
                  <tr><td colSpan={HEADERS.length} className="px-4 py-10 text-center text-fg-tertiary">No delivery matches that.</td></tr>
                ) : (
                  list.items.map((row) => {
                    const flagged = row.hasOpenException || row.codeLocked

                    return (
                      <tr key={row.deliveryId} className={cn('border-b border-line-subtle last:border-0 hover:bg-hover', flagged && 'bg-danger-subtle/30')}>
                        <td className="px-4 py-3">
                          <Link
                            to="/delivery/$deliveryId"
                            params={{ deliveryId: row.deliveryId }}
                            className="tabular whitespace-nowrap font-medium text-fg-brand underline-offset-2 hover:underline"
                            title={row.deliveryId}
                          >
                            {row.reference}
                          </Link>
                          <span className="block text-[11px] text-fg-tertiary">{row.senderName}</span>
                        </td>
                        <td className="px-4 py-3"><DeliveryStatePill state={row.state} /></td>
                        <td className="tabular whitespace-nowrap px-4 py-3 text-fg-secondary" title={new Date(row.stateSince).toLocaleString('en-NG')}>
                          {formatDuration(row.secondsInState)}
                        </td>
                        <td className="tabular whitespace-nowrap px-4 py-3 text-fg-secondary">
                          {row.courierId ?? <span className="text-fg-tertiary">—</span>}
                        </td>
                        <td className="tabular whitespace-nowrap px-4 py-3 text-fg-secondary">
                          {row.vehiclePlate ?? <span className="text-fg-tertiary">—</span>}
                        </td>
                        <td className="px-4 py-3"><TierBadge tier={row.tier} /></td>
                        <td className="px-4 py-3"><RouteCell pickup={row.pickupLabel} dropoff={row.dropoffLabel} /></td>
                        <td className="px-4 py-3"><ExceptionFlags row={row} /></td>
                        <td className="px-4 py-3 text-right"><Money minorUnits={row.fareMinor} currency={row.currency} /></td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
        )}

        <Pagination list={list} firstPageLabel="Longest in state first" />
      </section>
    </div>
  )
}

/**
 * The counts across the top, straight from `/counts`.
 *
 * Each tile is one state or a named pair of them; clicking one narrows the board to that
 * state. The pairs are added here from the server's per-state figures — arithmetic on a
 * handful of integers, not a re-sort of the rows.
 */
function CountTiles({
  data,
  loading,
  onPick,
}: {
  readonly data: DeliveryCounts | undefined
  readonly loading: boolean
  readonly onPick: (state: StateChip) => void
}) {
  const count = (state: DeliveryState): number => data?.counts[state] ?? 0

  const tiles: readonly { readonly label: string; readonly value: number; readonly pick: StateChip; readonly note: string }[] = [
    { label: 'Awaiting courier', value: count('Paid'), pick: 'Paid', note: 'paid, nobody assigned' },
    { label: 'Assigned', value: count('Assigned'), pick: 'Assigned', note: 'courier heading to pickup' },
    { label: 'In custody', value: count('Collected') + count('InTransit'), pick: 'InTransit', note: 'collected or on the road' },
    { label: 'Failed', value: count('PickupFailed') + count('DeliveryFailed'), pick: 'PickupFailed', note: 'pickup or delivery failed' },
    { label: 'Delivered', value: count('Delivered'), pick: 'Delivered', note: 'awaiting settlement' },
  ]

  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
      {tiles.map((tile) => (
        <button key={tile.label} type="button" onClick={() => { onPick(tile.pick) }} className="text-left" aria-label={`${tile.label}: ${String(tile.value)}`}>
          <StatTile label={tile.label} value={data === undefined ? '—' : tile.value.toLocaleString('en-NG')} loading={loading} note={tile.note} />
        </button>
      ))}
    </div>
  )
}
