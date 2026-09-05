import { useMemo } from 'react'

import type { MapBounds, MapSnapshot } from './snapshot'

/**
 * The board's map.
 *
 * Drawn from coordinates rather than tiles. The console has no map provider and no key
 * for one, and this screen does not need streets: it needs the zone outlines, where the
 * cars are, and which cells are surging. Everything else on a tile map is furniture that
 * costs a request and hides the four things being looked at.
 *
 * Nothing here invents a position. A car appears when location reported one; a surge
 * cell appears when pricing said that cell is surging. An operations map that fills its
 * empty space with plausible dots is a map that gets believed.
 */
export function LiveMap({ snapshot }: { readonly snapshot: MapSnapshot }) {
  const project = useProjection(snapshot.bounds)

  return (
    <svg
      viewBox={`0 0 ${String(VIEW_W)} ${String(VIEW_H)}`}
      className="h-full w-full"
      role="img"
      aria-label={`${String(snapshot.drivers.length)} drivers and ${String(snapshot.surgeCells.length)} surging cells across ${String(snapshot.zones.length)} zones`}
    >
      <rect width={VIEW_W} height={VIEW_H} fill="var(--map-base)" />

      {/* Zones first, so cars sit on top of the shape they are in. */}
      {snapshot.zones.map((zone) => {
        const points = zone.ring
          .map(([lng, lat]) => {
            const { x, y } = project(lat, lng)
            return `${x.toFixed(1)},${y.toFixed(1)}`
          })
          .join(' ')

        return (
          <polygon
            key={zone.zoneId}
            points={points}
            fill="var(--map-road)"
            fillOpacity={0.55}
            stroke={zone.killSwitchEngaged ? 'var(--border-danger)' : 'var(--border-subtle)'}
            strokeWidth={zone.killSwitchEngaged ? 1.5 : 1}
          >
            {/* A zone with its kill switch on is the single most consequential state on
                this screen, so it is outlined rather than tinted: a fill would be lost
                under the surge overlays that sit on exactly the zones most likely to be
                switched off. */}
            <title>
              {zone.name}
              {zone.killSwitchEngaged ? ' — surge kill switch engaged' : ''}
            </title>
          </polygon>
        )
      })}

      {snapshot.surgeCells.map((cell) => {
        const { x, y } = project(cell.lat, cell.lng)
        const r = project.metresToUnits(cell.radiusMetres)

        return (
          <g key={cell.cellId}>
            <circle cx={x} cy={y} r={r} fill="var(--bg-surge)" fillOpacity={0.16} />
            <circle cx={x} cy={y} r={r} fill="none" stroke="var(--bg-surge)" strokeOpacity={0.35} />

            <g transform={`translate(${String(x)} ${String(y)})`}>
              <rect x={-15} y={-8} width={30} height={16} rx={8} fill="var(--bg-surge-subtle)" />
              <text
                textAnchor="middle"
                dominantBaseline="central"
                fontSize={10}
                fontWeight={600}
                fill="var(--text-surge)"
              >
                {cell.multiplier.toFixed(1)}×
              </text>
            </g>
          </g>
        )
      })}

      {snapshot.drivers.map((driver) => {
        const { x, y } = project(driver.lat, driver.lng)

        return (
          <circle
            key={driver.driverId}
            cx={x}
            cy={y}
            r={3.5}
            fill={DRIVER_FILL[driver.state]}
            stroke="var(--map-base)"
            strokeWidth={1}
          />
        )
      })}
    </svg>
  )
}

/**
 * The legend, keyed off what is actually on the map.
 *
 * Built from the snapshot rather than written out as a fixed list, because a legend is a
 * claim about the picture. Location's nearby index holds dispatchable drivers and returns
 * no in-trip car at all, so a permanent "In trip" swatch would name a colour that never
 * appears — and the reader's conclusion is that no ride is under way.
 */
export function MapLegend({ snapshot }: { readonly snapshot: MapSnapshot }) {
  const present = new Set(snapshot.drivers.map((driver) => driver.state))

  const entries = [
    ...(['in_trip', 'idle', 'en_route'] as const)
      .filter((state) => present.has(state))
      .map((state) => ({ label: DRIVER_LABEL[state], colour: DRIVER_FILL[state] })),
    ...(snapshot.surgeCells.length > 0
      ? [{ label: 'Surge cell', colour: 'var(--bg-surge)' }]
      : []),
  ]

  if (entries.length === 0) {
    return null
  }

  return (
    <ul className="flex flex-wrap items-center gap-x-4 gap-y-1.5 rounded-lg border border-line-subtle bg-surface/90 px-3 py-1.5 backdrop-blur">
      {entries.map((entry) => (
        <li key={entry.label} className="flex items-center gap-1.5 text-[11px] text-fg-secondary">
          <span
            aria-hidden
            className="size-2 rounded-full"
            style={{ backgroundColor: entry.colour }}
          />
          {entry.label}
        </li>
      ))}
    </ul>
  )
}

const VIEW_W = 960
const VIEW_H = 620
const PADDING = 16

/**
 * Colour by what the car is doing, from the status ramp rather than fresh hexes.
 *
 * In-trip is the one that has to read first — it is the only state with a rider in the
 * car — which is why it takes the warm end of the ramp and idle takes the neutral one.
 */
const DRIVER_FILL: Record<'in_trip' | 'idle' | 'en_route', string> = {
  in_trip: 'var(--status-in-trip)',
  idle: 'var(--map-driver)',
  en_route: 'var(--status-online)',
}

const DRIVER_LABEL: Record<'in_trip' | 'idle' | 'en_route', string> = {
  in_trip: 'In trip',
  idle: 'Idle',
  en_route: 'En route',
}

/**
 * Latitude and longitude onto the viewBox.
 *
 * Equirectangular, with longitude squeezed by cos(latitude). Over a city that is
 * indistinguishable from a proper projection and costs nothing; without the squeeze,
 * Lagos comes out visibly stretched east-west.
 */
function useProjection(bounds: MapBounds) {
  return useMemo(() => {
    const midLat = (bounds.minLat + bounds.maxLat) / 2
    const lngScale = Math.cos((midLat * Math.PI) / 180)

    const spanLat = Math.max(bounds.maxLat - bounds.minLat, 1e-6)
    const spanLng = Math.max((bounds.maxLng - bounds.minLng) * lngScale, 1e-6)

    // One scale for both axes, so the city keeps its shape instead of being stretched to
    // fill whatever aspect ratio the panel happens to have.
    const scale = Math.min((VIEW_W - PADDING * 2) / spanLng, (VIEW_H - PADDING * 2) / spanLat)

    const offsetX = (VIEW_W - spanLng * scale) / 2
    const offsetY = (VIEW_H - spanLat * scale) / 2

    function project(lat: number, lng: number): { x: number; y: number } {
      return {
        x: offsetX + (lng - bounds.minLng) * lngScale * scale,
        // SVG y grows downward; latitude grows north.
        y: offsetY + (bounds.maxLat - lat) * scale,
      }
    }

    // Surge radii arrive in metres and have to be drawn in the same units as everything
    // else. 111_320 m is one degree of latitude, near enough at city scale.
    project.metresToUnits = (metres: number) => (metres / 111_320) * scale

    return project
  }, [bounds])
}
