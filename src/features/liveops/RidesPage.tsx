import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { useState } from 'react'

import { Money } from '../../components/ui/Money'
import { StatusPill, type Status } from '../../components/ui/StatusPill'
import { api } from '../../lib/api/client'
import { queryKeys } from '../../lib/query/client'
import { LoadError } from '../../components/ui/LoadError'

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

interface Page<T> {
  readonly items: readonly T[]
  readonly nextCursor: string | null
}

const STATES = ['All', 'Requested', 'Matched', 'InTrip', 'Completed', 'Cancelled'] as const

/** Ride search — the screen a support agent opens with a ride id in hand. */
export function RidesPage() {
  const [state, setState] = useState<(typeof STATES)[number]>('All')
  const [search, setSearch] = useState('')

  const rides = useQuery({
    queryKey: queryKeys.rides.list({ state, search }),
    queryFn: () =>
      api.get<Page<RideRow>>('/v1/admin/rides', {
        query: { state: state === 'All' ? undefined : state, search: search || undefined, limit: 50 },
      }),
    placeholderData: keepPreviousData,
  })

  return (
    <div className="space-y-4">
      <h1 className="text-[28px] font-semibold leading-[34px]">Rides</h1>

      <div className="flex flex-wrap items-center gap-2">
        <input
          value={search}
          onChange={(event) => { setSearch(event.target.value); }}
          placeholder="Ride id, rider or driver"
          aria-label="Search rides"
          className="h-9 w-72 rounded-md border border-line bg-surface px-3 text-[13px]"
        />

        {STATES.map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => { setState(option); }}
            aria-pressed={state === option}
            className={`rounded-full px-3 py-1.5 text-[13px] font-medium ${
              state === option ? 'bg-brand text-fg-on-brand' : 'bg-subtle text-fg-secondary hover:bg-hover'
            }`}
          >
            {option}
          </button>
        ))}
      </div>

      <div className="overflow-x-auto rounded-lg border border-line-subtle bg-surface">
        <table className="w-full min-w-[860px] border-collapse text-[13px]">
          <thead>
            <tr className="border-b border-line-subtle">
              {['Ride', 'Status', 'Route', 'Rider', 'Driver', 'Requested', 'Fare'].map((header, index) => (
                <th
                  key={header}
                  scope="col"
                  className={`px-4 py-3 text-[11px] font-semibold uppercase tracking-wide text-fg-tertiary ${
                    index === 6 ? 'text-right' : 'text-left'
                  }`}
                >
                  {header}
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {rides.isError ? (
              <tr>
                <td colSpan={7} className="px-4 py-6">
                  <LoadError
                    error={rides.error}
                    what="the ride list"
                    onRetry={() => { void rides.refetch() }}
                  />
                </td>
              </tr>
            ) : rides.isPending ? (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-fg-tertiary">
                  Loading…
                </td>
              </tr>
            ) : (
              rides.data.items.map((ride) => (
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
      return 'completed'
    case 'Cancelled':
    case 'Expired':
      return 'cancelled'
    default:
      return 'pending'
  }
}
