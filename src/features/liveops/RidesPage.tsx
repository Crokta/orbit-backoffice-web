import { Link } from '@tanstack/react-router'
import { useMemo, useState } from 'react'

import { Money } from '../../components/ui/Money'
import { StatusPill, type Status } from '../../components/ui/StatusPill'
import { LoadError } from '../../components/ui/LoadError'
import { api } from '../../lib/api/client'
import { dayBoundary, useDebounced, usePagedList, type Page } from '../../lib/paging'
import { queryKeys } from '../../lib/query/client'
import { Chips, DateRange, ExportButton, ListToolbar, Pagination, SearchBox } from '../shared/ListControls'

interface RideRow {
  readonly rideId: string
  readonly state: string

  // Ids, not names. Resolving a rider and a driver name per row would be two lookups
  // against two other services for every line of this table — a hundred round trips to
  // draw fifty rows. The route is what an operator scans for anyway, and the ride id
  // links through to the detail page, which does fan out for the names of the one ride
  // somebody actually opened.
  readonly riderId: string
  readonly driverId: string | null
  readonly zoneId: string | null
  readonly pickupLabel: string
  readonly dropoffLabel: string
  readonly fareMinor: number
  readonly currency: string
  readonly requestedAt: string
}

const STATES = ['All', 'Requested', 'Matched', 'Arrived', 'InTrip', 'Completed', 'Settled', 'Cancelled'] as const

interface RideFilters {
  readonly state: string | undefined
  readonly q: string | undefined
  readonly zoneId: string | undefined
  readonly from: string | undefined
  readonly to: string | undefined
}

/**
 * Ride search — the screen a support agent opens with a ride id in hand.
 *
 * Search, filters and paging all happen in the ride service. The console used to send a
 * search term the BFF ignored, so typing a ride id filtered nothing and looked broken.
 */
export function RidesPage() {
  const [state, setState] = useState<(typeof STATES)[number]>('All')
  const [search, setSearch] = useState('')
  const [zone, setZone] = useState('')
  const [range, setRange] = useState({ from: '', to: '' })

  const q = useDebounced(search.trim())
  const zoneId = useDebounced(zone.trim())

  const filters = useMemo<RideFilters>(
    () => ({
      state: state === 'All' ? undefined : state,
      q: q.length === 0 ? undefined : q,
      zoneId: zoneId.length === 0 ? undefined : zoneId,
      from: dayBoundary(range.from, 'start'),
      to: dayBoundary(range.to, 'end'),
    }),
    [state, q, zoneId, range],
  )

  const rides = usePagedList<RideRow, RideFilters>({
    key: queryKeys.rides.all,
    filters,
    fetchPage: (params) => api.get<Page<RideRow>>('/v1/admin/rides', { query: { ...params } }),
  })

  return (
    <div className="space-y-4">
      <h1 className="text-[28px] font-semibold leading-[34px]">Rides</h1>

      <ListToolbar actions={<ExportButton path="/v1/admin/rides/export.csv" query={{ ...filters }} filename="orbit-rides.csv" />}>
        <SearchBox value={search} onChange={setSearch} placeholder="Ride id, rider, driver or address" />
        <input
          type="search"
          value={zone}
          onChange={(event) => { setZone(event.target.value); }}
          placeholder="Zone id"
          aria-label="Filter by zone"
          className="h-9 w-36 rounded-md border border-line bg-surface px-3 text-[13px] placeholder:text-fg-tertiary"
        />
        <DateRange from={range.from} to={range.to} onChange={setRange} />
      </ListToolbar>

      <Chips<(typeof STATES)[number]>
        label="Ride state"
        value={state}
        onChange={setState}
        options={STATES.map((option) => ({ value: option, label: option === 'InTrip' ? 'In trip' : option }))}
      />

      <div className="overflow-x-auto rounded-lg border border-line-subtle bg-surface">
        <table className="w-full min-w-[860px] border-collapse text-[13px]">
          <thead>
            <tr className="border-b border-line-subtle">
              {['Ride', 'Status', 'Route', 'Rider', 'Driver', 'Zone', 'Requested', 'Fare'].map((header, index) => (
                <th
                  key={header}
                  scope="col"
                  className={`px-4 py-3 text-[11px] font-semibold uppercase tracking-wide text-fg-tertiary ${
                    index === 7 ? 'text-right' : 'text-left'
                  }`}
                >
                  {header}
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {rides.query.isError ? (
              <tr>
                <td colSpan={8} className="px-4 py-6">
                  <LoadError
                    error={rides.query.error}
                    what="the ride list"
                    onRetry={() => { void rides.query.refetch() }}
                  />
                </td>
              </tr>
            ) : rides.query.isPending ? (
              <tr>
                <td colSpan={8} className="px-4 py-10 text-center text-fg-tertiary">
                  Loading…
                </td>
              </tr>
            ) : rides.items.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-10 text-center text-fg-tertiary">
                  No ride matches that.
                </td>
              </tr>
            ) : (
              rides.items.map((ride) => (
                <tr key={ride.rideId} className="border-b border-line-subtle last:border-0 hover:bg-hover">
                  <td className="px-4 py-3">
                    <Link
                      to="/ride/$rideId"
                      params={{ rideId: ride.rideId }}
                      className="tabular whitespace-nowrap text-fg-brand underline-offset-2 hover:underline"
                      title={ride.rideId}
                    >
                      {ride.rideId.split('_').slice(0, 2).join('_')}
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    <StatusPill status={toStatus(ride.state)} />
                  </td>
                  <td className="px-4 py-3">
                    <span className="block">{ride.pickupLabel}</span>
                    <span className="block text-[12px] text-fg-tertiary">
                      to {ride.dropoffLabel}
                    </span>
                  </td>
                  <td className="tabular whitespace-nowrap px-4 py-3 text-fg-secondary">
                    {ride.riderId}
                  </td>
                  <td className="tabular whitespace-nowrap px-4 py-3 text-fg-secondary">
                    {ride.driverId ?? '—'}
                  </td>
                  <td className="tabular whitespace-nowrap px-4 py-3 text-fg-secondary">
                    {ride.zoneId ?? '—'}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-fg-secondary">
                    {new Date(ride.requestedAt).toLocaleString('en-NG')}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Money minorUnits={ride.fareMinor} currency={ride.currency} />
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <Pagination list={rides} />
    </div>
  )
}

function toStatus(state: string): Status {
  switch (state) {
    case 'InTrip':
      return 'in-trip'
    case 'Matched':
    case 'Arrived':
      return 'online'
    case 'Completed':
    case 'Settling':
    case 'Settled':
      return 'completed'
    case 'InArrears':
      return 'arrears'
    case 'Cancelled':
    case 'Expired':
      return 'cancelled'
    default:
      return 'pending'
  }
}
