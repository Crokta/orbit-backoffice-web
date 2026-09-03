import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'

import { StatusPill } from '../../components/ui/StatusPill'
import { api } from '../../lib/api/client'

interface LiveSnapshot {
  readonly onlineDrivers: number
  readonly idleDrivers: number
  readonly ridesInProgress: number
  readonly ridesSearching: number
  readonly medianMatchSeconds: number
  readonly unmatchedOverSla: readonly UnmatchedRide[]
  readonly hotZones: readonly HotZone[]
}

interface UnmatchedRide {
  readonly rideId: string
  readonly pickupLabel: string
  readonly waitingSeconds: number
  readonly zoneId: string
}

interface HotZone {
  readonly zoneId: string
  readonly name: string
  readonly surgeMultiplier: number
  readonly openRequests: number
  readonly idleDrivers: number
  readonly killSwitchEngaged: boolean
}

/**
 * The wall-display screen.
 *
 * Polls rather than holding a WebSocket. The gateway's socket capacity is sized for
 * riders and drivers — hundreds of thousands of them — and spending connections on a
 * handful of ops screens that are happy with five-second-old numbers is the wrong
 * trade (§5.3).
 */
export function LiveOpsPage() {
  const { data, isPending, isError, dataUpdatedAt } = useQuery({
    queryKey: ['live-ops'],
    queryFn: () => api.get<LiveSnapshot>('/v1/admin/live-ops'),
    refetchInterval: 5_000,

    // Zero, because this screen is only ever looked at for the current number. A
    // cached snapshot on a wall display is worse than a blank one: nobody can tell
    // it is old.
    staleTime: 0,
  })

  return (
    <div className="space-y-6">
      <header className="flex items-baseline justify-between">
        <h1 className="text-[28px] font-semibold leading-[34px]">Live operations</h1>

        <p className="text-[11px] uppercase tracking-wide text-fg-tertiary">
          {isError ? (
            // Says so loudly. A frozen dashboard that looks healthy is how a room
            // spends twenty minutes acting on numbers from before the incident.
            <span className="text-fg-danger">Not updating — last figures may be stale</span>
          ) : (
            `Updated ${new Date(dataUpdatedAt).toLocaleTimeString('en-NG')}`
          )}
        </p>
      </header>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <Tile label="Online drivers" value={data?.onlineDrivers} loading={isPending} />
        <Tile label="Idle drivers" value={data?.idleDrivers} loading={isPending} />
        <Tile label="Rides in progress" value={data?.ridesInProgress} loading={isPending} />
        <Tile
          label="Searching"
          value={data?.ridesSearching}
          loading={isPending}
          tone={data !== undefined && data.ridesSearching > data.idleDrivers ? 'danger' : 'neutral'}
        />
        <Tile
          label="Median match"
          value={data?.medianMatchSeconds}
          suffix="s"
          loading={isPending}
          // The §3 target is a p50 under 20 seconds. Amber above it, so the number
          // that matters is the one that changes colour rather than one buried in a
          // dashboard nobody reads.
          tone={data !== undefined && data.medianMatchSeconds > 20 ? 'warning' : 'neutral'}
        />
      </div>

      <section className="space-y-2">
        <h2 className="text-[15px] font-semibold">Waiting too long</h2>

        {data?.unmatchedOverSla.length === 0 ? (
          <p className="rounded-lg border border-line-subtle bg-surface p-6 text-center text-[13px] text-fg-tertiary">
            Nothing is over the matching SLA.
          </p>
        ) : (
          <ul className="divide-y divide-line-subtle overflow-hidden rounded-lg border border-line-subtle bg-surface">
            {data?.unmatchedOverSla.map((ride) => (
              <li key={ride.rideId}>
                <Link
                  to="/ride/$rideId"
                  params={{ rideId: ride.rideId }}
                  className="flex items-center justify-between px-4 py-3 hover:bg-hover"
                >
                  <div className="min-w-0">
                    <p className="tabular text-[13px]">{ride.rideId}</p>
                    <p className="truncate text-[13px] text-fg-secondary">{ride.pickupLabel}</p>
                  </div>

                  <span className="tabular text-[15px] font-medium text-fg-danger">
                    {Math.floor(ride.waitingSeconds / 60)}m {ride.waitingSeconds % 60}s
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-2">
        <h2 className="text-[15px] font-semibold">Zones under pressure</h2>

        <div className="overflow-x-auto rounded-lg border border-line-subtle bg-surface">
          <table className="w-full min-w-[640px] border-collapse text-[13px]">
            <thead>
              <tr className="border-b border-line-subtle">
                {['Zone', 'Surge', 'Open requests', 'Idle drivers', 'Kill switch'].map((header) => (
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
              {data?.hotZones.map((zone) => (
                <tr key={zone.zoneId} className="border-b border-line-subtle last:border-0">
                  <td className="px-4 py-3">{zone.name}</td>
                  <td className="px-4 py-3">
                    <span className={zone.surgeMultiplier > 1 ? 'tabular text-fg-surge' : 'tabular'}>
                      {zone.surgeMultiplier.toFixed(1)}×
                    </span>
                  </td>
                  <td className="tabular px-4 py-3">{zone.openRequests}</td>
                  <td className="tabular px-4 py-3">{zone.idleDrivers}</td>
                  <td className="px-4 py-3">
                    {zone.killSwitchEngaged ? (
                      <StatusPill status="cancelled" />
                    ) : (
                      <span className="text-fg-tertiary">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}

function Tile({
  label,
  value,
  suffix = '',
  loading,
  tone = 'neutral',
}: {
  readonly label: string
  readonly value: number | undefined
  readonly suffix?: string
  readonly loading: boolean
  readonly tone?: 'neutral' | 'warning' | 'danger'
}) {
  const colour =
    tone === 'danger' ? 'text-fg-danger' : tone === 'warning' ? 'text-fg-warning' : 'text-fg'

  return (
    <div className="rounded-lg border border-line-subtle bg-surface p-4">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-fg-tertiary">{label}</p>

      <p className={`tabular mt-1 text-[28px] font-semibold leading-[34px] ${colour}`}>
        {loading ? (
          <span className="inline-block h-7 w-16 animate-pulse rounded bg-subtle" aria-label="Loading" />
        ) : (
          `${value?.toLocaleString('en-NG') ?? '—'}${suffix}`
        )}
      </p>
    </div>
  )
}
