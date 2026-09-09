import { Link, useNavigate, useSearch } from '@tanstack/react-router'
import { useMemo } from 'react'
import { z } from 'zod'

import { LoadError } from '../../components/ui/LoadError'
import { Notice } from '../../components/ui/Inputs'
import { cn } from '../../components/ui/cn'
import { formatDateTime, formatDuration, secondsSince } from '../../lib/format'
import { usePagedList } from '../../lib/paging'
import { Chips, Pagination } from '../shared/ListControls'
import { DeliveryStatePill, RouteCell, TierBadge } from './DeliveryWidgets'
import { EXCEPTION_KINDS, EXCEPTION_KIND_LABEL, type ExceptionKind, type ExceptionListFilters, deliveryApi, deliveryKeys } from './api'

/**
 * The queue's address carries its filter, so a depot page can link straight to "what is
 * held here" and a colleague can paste the link to a specific view.
 */
export const exceptionsSearchSchema = z.object({
  kind: z.enum(EXCEPTION_KINDS).optional(),
  depotId: z.string().min(1).optional(),
})

type KindChip = 'all' | ExceptionKind

const KIND_CHIPS: readonly { readonly value: KindChip; readonly label: string }[] = [
  { value: 'all', label: 'All' },
  ...EXCEPTION_KINDS.map((kind) => ({ value: kind, label: EXCEPTION_KIND_LABEL[kind] })),
]

const HEADERS = ['Delivery', 'Exception', 'State', 'Tier', 'Courier', 'Route', 'Waiting', 'Depot', 'Note'] as const

/**
 * The exceptions queue (REQ125): failed pickups, failed deliveries, items held at a depot
 * with their day count, deliveries nobody accepted, what couriers reported, and locked codes.
 *
 * Oldest first, as the server returns them. The queue is worked from the top, and the top
 * is whoever has waited longest.
 */
export function ExceptionsPage() {
  const search = useSearch({ from: '/authenticated/deliveries/exceptions' })
  const navigate = useNavigate()

  const kind: KindChip = search.kind ?? 'all'
  const depotId = search.depotId

  const filters = useMemo<ExceptionListFilters>(
    () => ({ kind: kind === 'all' ? undefined : kind, depotId }),
    [kind, depotId],
  )

  const list = usePagedList({
    key: deliveryKeys.exceptions(),
    filters,
    fetchPage: (params) => deliveryApi.exceptions(params),
    refetchInterval: 30_000,
  })

  function pickKind(next: KindChip) {
    void navigate({
      to: '/deliveries/exceptions',
      search: { ...(next === 'all' ? {} : { kind: next }), ...(depotId === undefined ? {} : { depotId }) },
    })
  }

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-[12px]"><Link to="/deliveries" className="text-fg-brand hover:underline">Deliveries</Link></p>
          <h1 className="text-[22px] font-semibold leading-[28px]">Exceptions queue</h1>
          <p className="mt-0.5 text-[13px] text-fg-secondary">Oldest first. Work it from the top.</p>
        </div>
      </header>

      {depotId !== undefined && (
        <Notice
          tone="info"
          title={`Items held at depot ${depotId}`}
          action={
            <Link to="/deliveries/exceptions" search={kind === 'all' ? {} : { kind }} className="text-[13px] font-medium underline">
              Show every depot
            </Link>
          }
        >
          What the system says is physically at this depot. Reconcile it against the shelves (REQ128).
        </Notice>
      )}

      <Chips<KindChip> label="Exception kind" value={kind} options={KIND_CHIPS} onChange={pickKind} />

      {list.query.isError ? (
        <LoadError error={list.query.error} what="the exceptions queue" onRetry={() => { void list.query.refetch() }} />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-line-subtle bg-surface">
          <table className="w-full min-w-[1080px] border-collapse text-[13px]">
            <thead>
              <tr className="border-b border-line-subtle">
                {HEADERS.map((header) => (
                  <th key={header} scope="col" className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-fg-tertiary">
                    {header}
                  </th>
                ))}
              </tr>
            </thead>

            <tbody>
              {list.query.isPending ? (
                <tr><td colSpan={HEADERS.length} className="px-4 py-10 text-center text-fg-tertiary">Loading…</td></tr>
              ) : list.items.length === 0 ? (
                <tr><td colSpan={HEADERS.length} className="px-4 py-10 text-center text-fg-tertiary">Nothing is waiting. The queue is clear.</td></tr>
              ) : (
                list.items.map((row) => (
                  <tr key={`${row.deliveryId}:${row.kind}:${row.exceptionId ?? ''}`} className="border-b border-line-subtle last:border-0 hover:bg-hover">
                    <td className="px-4 py-3">
                      <Link
                        to="/delivery/$deliveryId"
                        params={{ deliveryId: row.deliveryId }}
                        className="tabular whitespace-nowrap font-medium text-fg-brand underline-offset-2 hover:underline"
                        title={row.deliveryId}
                      >
                        {row.reference}
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={cn(
                          'inline-flex items-center rounded-[4px] px-1.5 py-0.5 text-[11px] font-semibold leading-4',
                          row.kind === 'held_at_depot' || row.kind === 'unassigned' ? 'bg-warning-subtle text-fg-warning' : 'bg-danger-subtle text-fg-danger',
                        )}
                      >
                        {EXCEPTION_KIND_LABEL[row.kind]}
                      </span>
                    </td>
                    <td className="px-4 py-3"><DeliveryStatePill state={row.state} /></td>
                    <td className="px-4 py-3"><TierBadge tier={row.tier} /></td>
                    <td className="tabular whitespace-nowrap px-4 py-3 text-fg-secondary">{row.courierId ?? <span className="text-fg-tertiary">—</span>}</td>
                    <td className="px-4 py-3"><RouteCell pickup={row.pickupLabel} dropoff={row.dropoffLabel} /></td>
                    <td className="tabular whitespace-nowrap px-4 py-3 text-fg-secondary" title={formatDateTime(row.since)}>
                      {formatDuration(secondsSince(row.since))}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-fg-secondary">
                      {row.kind === 'held_at_depot' ? (
                        <>
                          <span className="tabular block">{row.depotId ?? '—'}</span>
                          <span className={cn('tabular block text-[12px]', row.daysHeld >= 7 ? 'text-fg-danger' : 'text-fg-tertiary')}>
                            {String(row.daysHeld)} {row.daysHeld === 1 ? 'day' : 'days'} held
                          </span>
                        </>
                      ) : (
                        <span className="text-fg-tertiary">—</span>
                      )}
                    </td>
                    <td className="max-w-[260px] truncate px-4 py-3 text-fg-secondary" title={row.note ?? undefined}>
                      {row.note ?? <span className="text-fg-tertiary">—</span>}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      <Pagination list={list} firstPageLabel="Oldest first" />
    </div>
  )
}
