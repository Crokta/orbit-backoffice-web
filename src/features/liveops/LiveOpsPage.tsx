import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'

import { LiveMap, MapLegend } from './LiveMap'
import { liveSnapshotQuery, type LiveSnapshot, type OperatorItem, type ZoneSupply } from './snapshot'
import { cn } from '../../components/ui/cn'

/**
 * The wall-display screen.
 *
 * Five numbers, a map, and a list of things waiting on a human. The ordering is the
 * argument: the tiles say whether the city is coping, the map says where it is not, and
 * the panel on the right is the only part anybody is expected to act on. Anything that
 * did not fit that sentence belongs on the page that owns it.
 */
export function LiveOpsPage() {
  const { data, isPending, isError, dataUpdatedAt } = useQuery(liveSnapshotQuery)

  return (
    <div className="space-y-5">
      <header className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-[22px] font-semibold leading-[28px]">
            Live operations{data?.city != null ? ` — ${data.city}` : ''}
          </h1>

          <p className="mt-0.5 truncate text-[12px] text-fg-tertiary">
            {isError ? (
              // Says so loudly. A frozen dashboard that looks healthy is how a room
              // spends twenty minutes acting on numbers from before the incident.
              <span className="text-fg-danger">Not updating — last figures may be stale</span>
            ) : (
              <Freshness at={dataUpdatedAt} snapshot={data} />
            )}
          </p>
        </div>

        {/* The bell goes somewhere. A notification affordance that only animates is a
            promise the console does not keep — this one is the incidents queue, which is
            what an operator is looking for when they reach for it. */}
        <Link
          to="/incidents"
          aria-label={
            data?.counts.incidentsOpen != null && data.counts.incidentsOpen > 0
              ? `${String(data.counts.incidentsOpen)} incidents open`
              : 'Incidents'
          }
          className="relative shrink-0 rounded-md p-2 text-fg-secondary transition-colors hover:bg-hover hover:text-fg"
        >
          <BellIcon />

          {data?.counts.incidentsOpen != null && data.counts.incidentsOpen > 0 ? (
            <span
              aria-hidden
              className="absolute right-1.5 top-1.5 size-2 rounded-full bg-danger ring-2 ring-surface"
            />
          ) : null}
        </Link>
      </header>

      {/* A section that did not answer is named. Without this the tiles just show "—"
          and nobody can tell a quiet night from a dead service. */}
      {data !== undefined && data.unavailable.length > 0 ? (
        <p
          role="status"
          className="rounded-lg bg-warning-subtle px-4 py-2.5 text-[13px] text-fg-warning"
        >
          Not reporting: {data.unavailable.join(', ')}. Those figures are unknown, not zero.
        </p>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <Tile
          label="Rides in progress"
          value={data?.ridesInProgress}
          loading={isPending}
          delta={data?.deltas.ridesInProgressPct}
          unit="pct"
          context="vs 1 hr ago"
          // Neither direction is good or bad on its own: more rides in progress is a
          // busier city, not a healthier or sicker one.
          better="neither"
        />

        <Tile
          label="Drivers online"
          value={data?.onlineDrivers}
          loading={isPending}
          delta={data?.deltas.onlineDriversPct}
          unit="pct"
          context="vs 1 hr ago"
          better="up"
        />

        <Tile
          label="Supply ratio"
          value={data?.supplyRatio}
          decimals={2}
          loading={isPending}
          delta={data?.deltas.supplyRatioAbs}
          unit="abs"
          context="idle drivers / open requests"
          better="up"
          // Below one, there are more requests than drivers free to take them. That is
          // the threshold the room reacts to, so it is the one that changes colour.
          tone={data?.supplyRatio != null && data.supplyRatio < 1 ? 'warning' : 'neutral'}
        />

        <Tile
          label="Unfulfilled requests"
          value={data?.ridesSearching}
          loading={isPending}
          delta={data?.deltas.unfulfilledPct}
          unit="pct"
          context="vs 1 hr ago"
          better="down"
          tone={
            data?.ridesSearching != null && data.idleDrivers != null && data.ridesSearching > data.idleDrivers
              ? 'danger'
              : 'neutral'
          }
        />

        <Tile
          label="P95 dispatch"
          value={data?.p95MatchSeconds}
          suffix=" s"
          loading={isPending}
          delta={data?.deltas.p95MatchSecondsAbs}
          unit="s"
          // The threshold comes from the snapshot, not from a constant here. It is the
          // same number matching was asked about, so this tile and the rides listed as
          // waiting too long cannot end up disagreeing about what "too long" means.
          context={
            data == null ? 'over the last hour' : `SLA ${String(data.dispatchSlaSeconds)} s`
          }
          better="down"
          tone={
            data?.p95MatchSeconds != null && data.p95MatchSeconds > data.dispatchSlaSeconds
              ? 'warning'
              : 'neutral'
          }
        />
      </div>

      <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_340px]">
        <section
          aria-label="Map"
          className="relative min-h-[420px] overflow-hidden rounded-xl border border-line-subtle bg-surface"
        >
          {data?.map != null ? (
            <>
              <LiveMap snapshot={data.map} />
              <div className="absolute left-3 top-3">
                <MapLegend snapshot={data.map} />
              </div>
            </>
          ) : (
            <div className="grid h-full min-h-[420px] place-items-center p-6 text-center">
              <p className="max-w-xs text-[13px] text-fg-tertiary">
                {isPending
                  ? 'Loading positions…'
                  : 'No positions are being reported. This is a gap in the feed, not an empty city.'}
              </p>
            </div>
          )}
        </section>

        <aside className="space-y-3">
          <NeedsOperatorCard items={data?.needsOperator} loading={isPending} />
          <SupplyByZoneCard zones={data?.zoneSupply} loading={isPending} />
        </aside>
      </div>
    </div>
  )
}

/**
 * The one line that says whether the board is worth believing.
 *
 * Age first, because it is the only part that is about the screen rather than the city.
 */
function Freshness({
  at,
  snapshot,
}: {
  readonly at: number
  readonly snapshot: LiveSnapshot | undefined
}) {
  const seconds = Math.max(0, Math.round((Date.now() - at) / 1000))

  const parts = [
    at === 0 ? 'Loading' : `Updated ${seconds < 5 ? 'just now' : `${String(seconds)}s ago`}`,
    snapshot?.onlineDrivers != null
      ? `${snapshot.onlineDrivers.toLocaleString('en-NG')} drivers online`
      : null,
    snapshot?.ridesInProgress != null
      ? `${snapshot.ridesInProgress.toLocaleString('en-NG')} rides in progress`
      : null,
  ].filter((part): part is string => part !== null)

  return <>{parts.join(' · ')}</>
}

function Tile({
  label,
  value,
  suffix = '',
  decimals = 0,
  loading,
  tone = 'neutral',
  delta,
  unit,
  context,
  better,
}: {
  readonly label: string
  readonly value: number | null | undefined
  readonly suffix?: string
  readonly decimals?: number
  readonly loading: boolean
  readonly tone?: 'neutral' | 'warning' | 'danger'
  readonly delta: number | null | undefined
  readonly unit: 'pct' | 'abs' | 's'
  readonly context: string
  readonly better: 'up' | 'down' | 'neither'
}) {
  const colour =
    tone === 'danger' ? 'text-fg-danger' : tone === 'warning' ? 'text-fg-warning' : 'text-fg'

  return (
    <div className="rounded-xl border border-line-subtle bg-surface p-4">
      <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-fg-tertiary">
        {label}
      </p>

      <p className={cn('tabular mt-1.5 text-[28px] font-semibold leading-[34px]', colour)}>
        {loading ? (
          <span
            className="inline-block h-7 w-16 animate-pulse rounded bg-subtle"
            aria-label="Loading"
          />
        ) : value == null ? (
          '—'
        ) : (
          `${value.toLocaleString('en-NG', {
            minimumFractionDigits: decimals,
            maximumFractionDigits: decimals,
          })}${suffix}`
        )}
      </p>

      <Delta value={delta} unit={unit} context={context} better={better} loading={loading} />
    </div>
  )
}

/**
 * Movement, and the absence of it.
 *
 * A null delta prints the context alone. The alternative — an arrow drawn from a value
 * nobody recorded — is a decoration that reads as evidence, on the screen where that
 * costs the most.
 */
function Delta({
  value,
  unit,
  context,
  better,
  loading,
}: {
  readonly value: number | null | undefined
  readonly unit: 'pct' | 'abs' | 's'
  readonly context: string
  readonly better: 'up' | 'down' | 'neither'
  readonly loading: boolean
}) {
  if (loading) {
    return <p className="mt-1.5 h-4" />
  }

  if (value == null || value === 0) {
    return <p className="mt-1.5 truncate text-[11px] text-fg-tertiary">{context}</p>
  }

  const rising = value > 0
  const good = better === 'neither' ? null : rising === (better === 'up')

  const magnitude =
    unit === 'pct'
      ? `${Math.abs(value).toFixed(1)}%`
      : unit === 's'
        ? `${String(Math.abs(value))} s`
        : Math.abs(value).toFixed(2)

  return (
    <p className="mt-1.5 flex items-center gap-1 truncate text-[11px]">
      <span
        className={cn(
          'tabular font-medium',
          good === null ? 'text-fg-secondary' : good ? 'text-fg-success' : 'text-fg-danger',
        )}
      >
        <span aria-hidden>{rising ? '▲' : '▼'}</span>{' '}
        <span className="sr-only">{rising ? 'up' : 'down'} </span>
        {magnitude}
      </span>

      <span className="truncate text-fg-tertiary">{context}</span>
    </p>
  )
}

/**
 * The worklist.
 *
 * Oldest first, and the ordering is the whole point: this panel exists so that nothing
 * sits unattended because it stopped being the newest thing on the screen.
 */
function NeedsOperatorCard({
  items,
  loading,
}: {
  readonly items: readonly OperatorItem[] | undefined
  readonly loading: boolean
}) {
  return (
    <section className="rounded-xl border border-line-subtle bg-surface p-4">
      <h2 className="text-[14px] font-semibold">Needs an operator</h2>
      <p className="mt-0.5 text-[11px] text-fg-tertiary">Ordered by age, oldest first</p>

      {loading ? (
        <p className="mt-3 text-[12px] text-fg-tertiary">Loading…</p>
      ) : items === undefined || items.length === 0 ? (
        <p className="mt-3 text-[12px] text-fg-tertiary">
          Nothing is waiting on a human right now.
        </p>
      ) : (
        <ul className="mt-3 space-y-3">
          {items.map((item) => (
            <li key={item.id}>
              {item.href === null ? (
                <p className="text-[13px] font-medium text-fg">{item.title}</p>
              ) : (
                <Link
                  to={item.href}
                  className="text-[13px] font-medium text-fg-brand hover:underline"
                >
                  {item.title}
                </Link>
              )}

              <p className="tabular mt-0.5 text-[11px] text-fg-tertiary">{item.detail}</p>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

/**
 * Supply against demand, zone by zone.
 *
 * The bar is the point: five numbers in a column get compared one pair at a time, five
 * bars get compared at once, and the question this panel answers — where do we move
 * drivers to — is a comparison.
 */
function SupplyByZoneCard({
  zones,
  loading,
}: {
  readonly zones: readonly ZoneSupply[] | undefined
  readonly loading: boolean
}) {
  return (
    <section className="rounded-xl border border-line-subtle bg-surface p-4">
      <h2 className="text-[14px] font-semibold">Supply by zone</h2>
      <p className="mt-0.5 text-[11px] text-fg-tertiary">Idle drivers vs open requests</p>

      {loading ? (
        <p className="mt-3 text-[12px] text-fg-tertiary">Loading…</p>
      ) : zones === undefined || zones.length === 0 ? (
        <p className="mt-3 text-[12px] text-fg-tertiary">No zone has open requests on it.</p>
      ) : (
        <ul className="mt-3 space-y-2.5">
          {zones.map((zone) => (
            <li key={zone.zoneId}>
              <div className="flex items-baseline justify-between gap-2">
                <span className="truncate text-[12px] text-fg-secondary">{zone.name}</span>

                <span className="tabular shrink-0 text-[12px] text-fg">
                  {zone.ratio == null ? '—' : zone.ratio.toFixed(2)}
                </span>
              </div>

              <div
                className="mt-1 h-1.5 overflow-hidden rounded-full bg-subtle"
                role="img"
                aria-label={`${zone.name}: ${String(zone.idleDrivers)} idle drivers against ${String(zone.openRequests)} open requests`}
              >
                <div
                  className={cn('h-full rounded-full', barTone(zone.ratio))}
                  // Capped, so one over-supplied zone does not flatten every other bar
                  // into a stub. Past the cap the number carries the detail.
                  style={{
                    width: `${String(Math.min((zone.ratio ?? 0) / BAR_FULL_RATIO, 1) * 100)}%`,
                  }}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

/** A zone with 1.5 idle drivers per open request fills the bar. */
const BAR_FULL_RATIO = 1.5

function barTone(ratio: number | null): string {
  if (ratio === null) {
    return 'bg-disabled'
  }

  // One driver per request is break-even; the amber band starts before it, so a zone
  // gets attention on the way down rather than once it is already short.
  if (ratio < 0.6) {
    return 'bg-danger'
  }

  return ratio < 0.9 ? 'bg-warning' : 'bg-success'
}

function BellIcon() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 16 16"
      className="size-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M4 6.6a4 4 0 0 1 8 0c0 3 .9 4.3 1.4 4.8H2.6C3.1 10.9 4 9.6 4 6.6" />
      <path d="M6.4 13.4a1.8 1.8 0 0 0 3.2 0" />
    </svg>
  )
}
