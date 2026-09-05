import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { useMemo, useState } from 'react'

import { liveSnapshotQuery } from '../liveops/snapshot'
import { api } from '../../lib/api/client'
import { useDebounced, usePagedList, type Page } from '../../lib/paging'
import { queryKeys } from '../../lib/query/client'
import { ExportButton, FilterSelect, ListToolbar, Pagination, SearchBox } from '../shared/ListControls'
import { LoadError } from '../../components/ui/LoadError'

interface DriverRow {
  readonly driverId: string
  readonly displayName: string
  readonly phoneMasked: string
  readonly status: string
  readonly rating: number
  readonly completedRides: number
  readonly joinedAt: string
}

interface WaitingDriver {
  readonly driverId: string
  readonly displayName: string
  readonly submittedAt: string
  readonly documentsOutstanding: readonly string[]
}

interface DriverFilters {
  readonly q: string | undefined
  readonly status: string
}

const STATUSES = ['all', 'Online', 'Offline', 'Idle', 'OnTrip', 'Paused'] as const

/**
 * The fleet, as far as the platform can currently describe it.
 *
 * Two questions, from the two services that can actually answer them: how much of the
 * fleet is working right now (location's presence keys), and who is stuck on the way in
 * (identity's compliance queue). The directory beneath is searched, filtered and paged by
 * the user service.
 */
export function DriversPage() {
  const { data: snapshot, isPending: snapshotPending } = useQuery(liveSnapshotQuery)

  const queue = useQuery({
    queryKey: ['compliance', 'queue', 'preview'],
    queryFn: () => api.get<Page<WaitingDriver>>('/v1/admin/compliance/queue', { query: { limit: 5 } }),
    refetchInterval: 60_000,
  })

  const [search, setSearch] = useState('')
  const [status, setStatus] = useState<(typeof STATUSES)[number]>('all')
  const q = useDebounced(search.trim())

  const filters = useMemo<DriverFilters>(() => ({ q: q.length === 0 ? undefined : q, status }), [q, status])

  const directory = usePagedList<DriverRow, DriverFilters>({
    key: queryKeys.drivers.all,
    filters,
    fetchPage: (params) => api.get<Page<DriverRow>>('/v1/admin/drivers', { query: { ...params } }),
  })

  const online = snapshot?.onlineDrivers ?? null
  const idle = snapshot?.idleDrivers ?? null
  const waiting = queue.data?.items ?? []

  return (
    <div className="space-y-5">
      <h1 className="text-[22px] font-semibold leading-[28px]">Drivers</h1>

      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label="Online" value={online} loading={snapshotPending} />
        <Stat label="Idle" value={idle} loading={snapshotPending} />
        <Stat
          label="On a trip"
          // Derived rather than fetched: the two counts come from the same snapshot, so
          // subtracting them cannot disagree with itself the way a third poll could.
          value={online != null && idle != null ? online - idle : null}
          loading={snapshotPending}
        />
      </div>

      <section className="space-y-2">
        <div className="flex items-baseline justify-between">
          <h2 className="text-[15px] font-semibold">Waiting on compliance</h2>

          <Link to="/compliance" className="text-[12px] text-fg-brand hover:underline">
            Open the queue{queue.data?.nextCursor != null ? ' (more waiting)' : ''}
          </Link>
        </div>

        {queue.isPending ? (
          <p className="rounded-xl border border-line-subtle bg-surface p-6 text-center text-[13px] text-fg-tertiary">
            Loading…
          </p>
        ) : waiting.length === 0 ? (
          <p className="rounded-xl border border-line-subtle bg-surface p-6 text-center text-[13px] text-fg-tertiary">
            Nobody is waiting on a compliance decision.
          </p>
        ) : (
          <ul className="divide-y divide-line-subtle overflow-hidden rounded-xl border border-line-subtle bg-surface">
            {waiting.map((driver) => (
              <li key={driver.driverId}>
                <Link
                  to="/kyc/$driverId"
                  params={{ driverId: driver.driverId }}
                  className="flex items-center justify-between gap-4 px-4 py-3 hover:bg-hover"
                >
                  <div className="min-w-0">
                    <p className="truncate text-[13px] font-medium">{driver.displayName}</p>
                    <p className="tabular truncate text-[11px] text-fg-tertiary">
                      {driver.driverId}
                    </p>
                  </div>

                  <span className="shrink-0 text-[12px] text-fg-secondary">
                    {driver.documentsOutstanding.length} outstanding
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-[15px] font-semibold">Directory</h2>
        </div>

        <ListToolbar actions={<ExportButton path="/v1/admin/drivers/export.csv" query={{ q: filters.q, status: filters.status }} filename="orbit-drivers.csv" />}>
          <SearchBox value={search} onChange={setSearch} placeholder="Name or phone" className="w-64" />
          <FilterSelect<(typeof STATUSES)[number]>
            label="Filter by status"
            value={status}
            onChange={setStatus}
            options={STATUSES.map((option) => ({ value: option, label: option === 'all' ? 'Any status' : option === 'OnTrip' ? 'On trip' : option }))}
          />
        </ListToolbar>

        {directory.query.isError ? (
          <LoadError error={directory.query.error} what="the driver directory" onRetry={() => { void directory.query.refetch() }} />
        ) : (
          <div className="overflow-x-auto rounded-xl border border-line-subtle bg-surface">
            <table className="w-full min-w-[720px] border-collapse text-[13px]">
              <thead>
                <tr className="border-b border-line-subtle">
                  {['Driver', 'Phone', 'Status', 'Rating', 'Rides', 'Joined'].map((header) => (
                    <th
                      key={header}
                      scope="col"
                      className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-fg-tertiary"
                    >
                      {header}
                    </th>
                  ))}
                </tr>
              </thead>

              <tbody>
                {directory.query.isPending ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-fg-tertiary">
                      Loading…
                    </td>
                  </tr>
                ) : null}

                {!directory.query.isPending && directory.items.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-fg-tertiary">
                      No driver matches that.
                    </td>
                  </tr>
                ) : null}

                {directory.items.map((driver) => (
                  <tr key={driver.driverId} className="border-b border-line-subtle last:border-0">
                    <td className="px-4 py-3">
                      <p className="font-medium">{driver.displayName}</p>
                      <p className="tabular text-[11px] text-fg-tertiary">{driver.driverId}</p>
                    </td>
                    <td className="tabular px-4 py-3 text-fg-secondary">{driver.phoneMasked}</td>
                    <td className="px-4 py-3 text-fg-secondary">{driver.status}</td>
                    <td className="tabular px-4 py-3">{driver.rating.toFixed(2)}</td>
                    <td className="tabular px-4 py-3">
                      {driver.completedRides.toLocaleString('en-NG')}
                    </td>
                    <td className="px-4 py-3 text-fg-secondary">
                      {new Date(driver.joinedAt).toLocaleDateString('en-NG')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <Pagination list={directory} />

        {/* Said plainly, because a masked column invites somebody to go looking for the
            unmasking toggle. There is not one here on purpose. */}
        <p className="text-[11px] text-fg-tertiary">
          Phone numbers are masked in the directory and in the export. Full contact details
          are read one driver at a time, and each read is recorded.
        </p>
      </section>
    </div>
  )
}

function Stat({
  label,
  value,
  loading,
}: {
  readonly label: string
  readonly value: number | null
  readonly loading: boolean
}) {
  return (
    <div className="rounded-xl border border-line-subtle bg-surface p-4">
      <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-fg-tertiary">
        {label}
      </p>

      <p className="tabular mt-1.5 text-[28px] font-semibold leading-[34px]">
        {loading ? (
          <span
            className="inline-block h-7 w-16 animate-pulse rounded bg-subtle"
            aria-label="Loading"
          />
        ) : (
          (value?.toLocaleString('en-NG') ?? '—')
        )}
      </p>
    </div>
  )
}
