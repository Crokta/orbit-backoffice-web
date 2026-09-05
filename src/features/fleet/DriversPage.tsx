import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { useState } from 'react'

import { liveSnapshotQuery } from '../liveops/snapshot'
import { api } from '../../lib/api/client'

interface DriverPage {
  readonly items: readonly DriverRow[]
  readonly nextCursor: string | null
}

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

/**
 * The fleet, as far as the platform can currently describe it.
 *
 * Two questions, from the two services that can actually answer them: how much of the
 * fleet is working right now (location's presence keys), and who is stuck on the way in
 * (identity's compliance queue). There is deliberately no driver directory here — see
 * the note at the foot of the page.
 */
export function DriversPage() {
  const { data: snapshot, isPending: snapshotPending } = useQuery(liveSnapshotQuery)

  const queue = useQuery({
    queryKey: ['compliance', 'queue'],
    queryFn: () => api.get<readonly WaitingDriver[]>('/v1/admin/compliance/queue'),
    refetchInterval: 60_000,
  })

  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('all')

  // Cursors, not a page number. The endpoint is keyset-paged because a fleet is appended
  // to while somebody reads it, so "back" means the cursor we came from rather than
  // page - 1 — which is why this is a stack and not an integer.
  const [cursors, setCursors] = useState<readonly string[]>([])
  const cursor = cursors.at(-1) ?? null

  const directory = useQuery({
    queryKey: ['drivers', { search, status, cursor }],
    queryFn: () =>
      api.get<DriverPage>('/v1/admin/drivers', {
        query: { query: search || undefined, status, cursor: cursor ?? undefined },
      }),

    // The table keeps the previous page on screen while the next one loads. A directory
    // that blanks between pages is one an agent loses their place in.
    placeholderData: keepPreviousData,
  })

  const online = snapshot?.onlineDrivers ?? null
  const idle = snapshot?.idleDrivers ?? null

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
            Open the queue
          </Link>
        </div>

        {queue.isPending ? (
          <p className="rounded-xl border border-line-subtle bg-surface p-6 text-center text-[13px] text-fg-tertiary">
            Loading…
          </p>
        ) : queue.data === undefined || queue.data.length === 0 ? (
          <p className="rounded-xl border border-line-subtle bg-surface p-6 text-center text-[13px] text-fg-tertiary">
            Nobody is waiting on a compliance decision.
          </p>
        ) : (
          <ul className="divide-y divide-line-subtle overflow-hidden rounded-xl border border-line-subtle bg-surface">
            {queue.data.map((driver) => (
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

          <div className="flex items-center gap-2">
            <input
              type="search"
              value={search}
              onChange={(event) => {
                setSearch(event.target.value)
                // A new search invalidates the page we were on: cursor 'page 3 of the
                // old result' is meaningless against a different predicate.
                setCursors([])
              }}
              placeholder="Name or phone"
              aria-label="Search drivers by name or phone"
              className="h-8 rounded-md border border-line bg-surface px-2.5 text-[13px] placeholder:text-fg-tertiary"
            />

            <select
              value={status}
              onChange={(event) => {
                setStatus(event.target.value)
                setCursors([])
              }}
              aria-label="Filter by status"
              className="h-8 rounded-md border border-line bg-surface px-2 text-[13px]"
            >
              {['all', 'Online', 'Offline', 'Idle', 'OnTrip', 'Paused'].map((option) => (
                <option key={option} value={option}>
                  {option === 'all' ? 'Any status' : option}
                </option>
              ))}
            </select>
          </div>
        </div>

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
              {directory.isPending ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-fg-tertiary">
                    Loading…
                  </td>
                </tr>
              ) : null}

              {directory.data?.items.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-fg-tertiary">
                    No driver matches that.
                  </td>
                </tr>
              ) : null}

              {directory.data?.items.map((driver) => (
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

        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            disabled={cursors.length === 0}
            onClick={() => {
              setCursors((stack) => stack.slice(0, -1))
            }}
            className="h-8 rounded-md border border-line px-3 text-[12px] font-medium text-fg-secondary transition-colors hover:bg-hover hover:text-fg disabled:opacity-40"
          >
            Previous
          </button>

          <button
            type="button"
            disabled={directory.data?.nextCursor == null}
            onClick={() => {
              const next = directory.data?.nextCursor

              if (next != null) {
                setCursors((stack) => [...stack, next])
              }
            }}
            className="h-8 rounded-md border border-line px-3 text-[12px] font-medium text-fg-secondary transition-colors hover:bg-hover hover:text-fg disabled:opacity-40"
          >
            Next
          </button>
        </div>

        {/* Said plainly, because a masked column invites somebody to go looking for the
            unmasking toggle. There is not one here on purpose. */}
        <p className="text-[11px] text-fg-tertiary">
          Phone numbers are masked in the directory. Full contact details are read one
          driver at a time, and each read is recorded.
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
