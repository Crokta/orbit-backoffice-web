import { queryOptions } from '@tanstack/react-query'

import { api } from '../../lib/api/client'

/**
 * The live operations picture, as one poll.
 *
 * Both the board and the sidebar badges read this. One query key, so the console makes a
 * single request every five seconds rather than one per consumer: the counts beside
 * "Compliance" and the tiles on the board are the same snapshot, and two polls could
 * disagree with each other on screen.
 */
export interface LiveSnapshot {
  /** The market this console is pointed at, for the page heading. */
  readonly city: string | null

  // Nullable, and the distinction matters on a wall display: null is "the service that
  // owns this number did not answer", zero is "there are none". Showing an outage as a
  // confident 0 is how a room decides nothing is happening.
  readonly onlineDrivers: number | null
  readonly idleDrivers: number | null
  readonly ridesInProgress: number | null
  readonly ridesSearching: number | null
  readonly medianMatchSeconds: number | null
  readonly p95MatchSeconds: number | null

  /**
   * The threshold this snapshot was computed against, in seconds.
   *
   * Sent by the BFF rather than held here, because it is the same number matching was
   * asked about when deciding which rides count as waiting too long. A board colouring
   * a figure against its own constant would eventually disagree with the service that
   * produced the figure, and neither would look wrong on its own.
   */
  readonly dispatchSlaSeconds: number

  /** Idle drivers per open request. Below 1.0 means demand outruns supply. */
  readonly supplyRatio: number | null

  readonly deltas: LiveDeltas
  readonly unmatchedOverSla: readonly UnmatchedRide[]
  readonly hotZones: readonly HotZone[]
  readonly zoneSupply: readonly ZoneSupply[]
  readonly needsOperator: readonly OperatorItem[]
  readonly counts: NavCounts

  /**
   * Where everything is, for the board's map.
   *
   * Null when the services that hold position data did not answer. The panel then says
   * so rather than drawing an empty city, because an operations map with no cars on it
   * and no explanation reads as a quiet night.
   */
  readonly map: MapSnapshot | null

  /** Sections that did not answer, named so the screen can say which. */
  readonly unavailable: readonly string[]
}

/**
 * Movement since an hour ago, and nulls are the common case.
 *
 * Two of these are ratios of counts the platform keeps a history of; the rest are
 * instantaneous gauges that nothing stores a past value for. A tile with a null delta
 * shows the number and no arrow, which is the honest rendering — an arrow computed
 * against a value nobody recorded is a decoration that looks like evidence.
 */
export interface LiveDeltas {
  /** Percentage points, signed. */
  readonly ridesInProgressPct: number | null
  readonly onlineDriversPct: number | null
  readonly unfulfilledPct: number | null

  /** Absolute movement, in the metric's own unit. */
  readonly supplyRatioAbs: number | null
  readonly p95MatchSecondsAbs: number | null
}

export interface UnmatchedRide {
  readonly rideId: string
  readonly waitingSeconds: number
  readonly zoneId: string
}

export interface HotZone {
  readonly zoneId: string
  readonly name: string
  readonly openRequests: number
  readonly killSwitchEngaged: boolean
}

/** One zone's supply against its demand, for the board's zone bars. */
export interface ZoneSupply {
  readonly zoneId: string
  readonly name: string
  readonly idleDrivers: number
  readonly openRequests: number

  /** Idle drivers per open request. Null when the zone has no open requests to divide by. */
  readonly ratio: number | null
}

/**
 * One thing waiting on a human.
 *
 * Assembled across services and sorted oldest-first, because the whole point of the panel
 * is that nothing sits in it unnoticed. Each carries a link, so the panel is a worklist
 * rather than a list of things to go and find.
 */
export interface OperatorItem {
  readonly id: string
  readonly kind: 'ride' | 'incident' | 'surge' | 'fraud' | 'payout'
  readonly title: string
  readonly detail: string
  readonly href: string | null

  /** Seconds this has been waiting, for the ordering the panel promises. */
  readonly ageSeconds: number
}

/** The counts the sidebar shows beside a section. */
export interface NavCounts {
  readonly complianceQueue: number | null
  readonly fraudOpen: number | null
  readonly incidentsOpen: number | null
}

/**
 * Polls rather than holding a WebSocket.
 *
 * The gateway's socket capacity is sized for riders and drivers — hundreds of thousands
 * of them — and spending connections on a handful of ops screens that are happy with
 * five-second-old numbers is the wrong trade (§5.3).
 */
export const liveSnapshotQuery = queryOptions({
  queryKey: ['live-ops'],
  queryFn: () => api.get<LiveSnapshot>('/v1/admin/live-ops'),
  refetchInterval: 5_000,

  // Zero, because this screen is only ever looked at for the current number. A cached
  // snapshot on a wall display is worse than a blank one: nobody can tell it is old.
  staleTime: 0,
})

/**
 * The city, as far as this console can see it.
 *
 * Coordinates rather than tiles. The console has no map provider and no key for one, and
 * an operations board does not need streets — it needs zone shapes, where the cars are,
 * and which cells are surging. Everything here is projected into an SVG at render time.
 */
export interface MapSnapshot {
  /** The extent to fit, so the projection does not have to scan every point twice. */
  readonly bounds: MapBounds

  readonly zones: readonly MapZone[]
  readonly drivers: readonly MapDriver[]
  readonly surgeCells: readonly SurgeCell[]
}

export interface MapBounds {
  readonly minLat: number
  readonly minLng: number
  readonly maxLat: number
  readonly maxLng: number
}

/** One zone's outline, already simplified to a single ring by the BFF. */
export interface MapZone {
  readonly zoneId: string
  readonly name: string

  /** Closed ring of [lng, lat] pairs, GeoJSON order. */
  readonly ring: readonly (readonly [number, number])[]
  readonly killSwitchEngaged: boolean
}

export interface MapDriver {
  readonly driverId: string
  readonly lat: number
  readonly lng: number

  /** What the car is doing, which is what the legend colours. */
  readonly state: 'in_trip' | 'idle' | 'en_route'
}

/**
 * A surging H3 cell.
 *
 * Per cell, never per zone: surge is computed on r7 cells (§6.2) and a zone spans many
 * of them at different multipliers, so a single zone-level figure would be a number
 * nobody could act on.
 */
export interface SurgeCell {
  readonly cellId: string
  readonly lat: number
  readonly lng: number
  readonly multiplier: number

  /** Drawn radius, from the cell's own size rather than a constant. */
  readonly radiusMetres: number
}
