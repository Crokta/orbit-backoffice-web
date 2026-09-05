import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'

import { liveSnapshotQuery } from '../liveops/snapshot'
import { api } from '../../lib/api/client'

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

      {/* Stated on the page rather than left as an absence, so nobody concludes the
          platform has three drivers. User holds driver profiles but exposes only
          GetDriver — one driver, by id — so a directory cannot be assembled without a
          list RPC that does not exist yet. */}
      <p className="max-w-2xl text-[12px] text-fg-tertiary">
        There is no driver directory here yet. The user service can return a driver by id
        but has no list operation, so this page shows the two views that can be sourced
        today: who is working, and who is stuck on the way in.
      </p>
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
