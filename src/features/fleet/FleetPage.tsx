import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { useMemo, useState } from 'react'

import { Button } from '../../components/ui/Button'
import { LoadError } from '../../components/ui/LoadError'
import { StatusPill } from '../../components/ui/StatusPill'
import { cn } from '../../components/ui/cn'
import { formatDate, formatDateTime, formatDuration, secondsSince } from '../../lib/format'
import { useDebounced, usePagedList } from '../../lib/paging'
import { type Tier } from '../delivery/api'
import { TierBadge } from '../delivery/DeliveryWidgets'
import { FilterSelect, ListToolbar, Pagination, SearchBox } from '../shared/ListControls'
import { AssignVehicleDialog, RegisterVehicleDialog } from './FleetDialogs'
import {
  type FleetVehicle,
  VEHICLE_STATUSES,
  VEHICLE_STATUS_LABEL,
  type VehicleListFilters,
  type VehicleStatus,
  fleetApi,
  fleetKeys,
  isOverdue,
  vehicleStatusTone,
} from './api'

const TIER_OPTIONS: readonly { readonly value: Tier | 'all'; readonly label: string }[] = [
  { value: 'all', label: 'All tiers' },
  { value: 'Bike', label: 'Bike' },
  { value: 'Van', label: 'Van' },
  { value: 'Truck', label: 'Truck' },
]

const STATUS_OPTIONS: readonly { readonly value: VehicleStatus | 'all'; readonly label: string }[] = [
  { value: 'all', label: 'Any status' },
  ...VEHICLE_STATUSES.map((status) => ({ value: status, label: VEHICLE_STATUS_LABEL[status] })),
]

const HEADERS = ['Vehicle', 'Tier', 'Courier', 'Shift', 'Home depot', 'Mileage', 'Next service', 'Road-legal', ''] as const

/**
 * The fleet (REQ123): every Orbit-owned vehicle, who has it, when it is due back, where it
 * lives, how far it has gone and when it next needs the workshop.
 */
export function FleetPage() {
  const [search, setSearch] = useState('')
  const [tier, setTier] = useState<Tier | 'all'>('all')
  const [status, setStatus] = useState<VehicleStatus | 'all'>('all')
  const [depotId, setDepotId] = useState('')
  const [registering, setRegistering] = useState(false)
  const [assigning, setAssigning] = useState<FleetVehicle | null>(null)

  const q = useDebounced(search.trim())
  const depots = useQuery({ queryKey: fleetKeys.depots(), queryFn: fleetApi.depots })

  const filters = useMemo<VehicleListFilters>(
    () => ({
      q: q.length === 0 ? undefined : q,
      tier: tier === 'all' ? undefined : tier,
      status: status === 'all' ? undefined : status,
      depotId: depotId.length === 0 ? undefined : depotId,
    }),
    [q, tier, status, depotId],
  )

  const list = usePagedList({
    key: fleetKeys.vehicles(),
    filters,
    fetchPage: (params) => fleetApi.vehicles(params),
    refetchInterval: 30_000,
  })

  const depotOptions = [
    { value: '', label: 'Any depot' },
    ...(depots.data ?? []).map((depot) => ({ value: depot.depotId, label: depot.name })),
  ]

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-[22px] font-semibold leading-[28px]">Fleet</h1>
          <p className="mt-0.5 text-[13px] text-fg-secondary">Orbit-owned vehicles: who has them, when they are due back, and what they need.</p>
        </div>

        <div className="flex items-center gap-3">
          <Link to="/fleet/depots" className="text-[13px] font-medium text-fg-brand hover:underline">Depots →</Link>
          <Button onClick={() => { setRegistering(true) }}>Register vehicle</Button>
        </div>
      </header>

      <ListToolbar>
        <SearchBox value={search} onChange={setSearch} placeholder="Plate, make, model or courier" />
        <FilterSelect label="Filter by tier" value={tier} options={TIER_OPTIONS} onChange={setTier} />
        <FilterSelect label="Filter by status" value={status} options={STATUS_OPTIONS} onChange={setStatus} />
        <FilterSelect label="Filter by depot" value={depotId} options={depotOptions} onChange={setDepotId} />
      </ListToolbar>

      {list.query.isError ? (
        <LoadError error={list.query.error} what="the fleet" onRetry={() => { void list.query.refetch() }} />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-line-subtle bg-surface">
          <table className="w-full min-w-[1080px] border-collapse text-[13px]">
            <thead>
              <tr className="border-b border-line-subtle">
                {HEADERS.map((header, index) => (
                  <th
                    key={header.length === 0 ? 'actions' : header}
                    scope="col"
                    className={cn('px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-fg-tertiary', index === 5 && 'text-right')}
                  >
                    {header}
                  </th>
                ))}
              </tr>
            </thead>

            <tbody>
              {list.query.isPending ? (
                <tr><td colSpan={HEADERS.length} className="px-4 py-10 text-center text-fg-tertiary">Loading…</td></tr>
              ) : list.items.length === 0 ? (
                <tr><td colSpan={HEADERS.length} className="px-4 py-10 text-center text-fg-tertiary">No vehicle matches that.</td></tr>
              ) : (
                list.items.map((vehicle) => {
                  const overdue = isOverdue(vehicle)

                  return (
                    <tr key={vehicle.vehicleId} className={cn('border-b border-line-subtle last:border-0 hover:bg-hover', (overdue || !vehicle.isRoadLegal) && 'bg-danger-subtle/30')}>
                      <td className="px-4 py-3">
                        <Link to="/fleet/vehicle/$vehicleId" params={{ vehicleId: vehicle.vehicleId }} className="tabular font-medium text-fg-brand underline-offset-2 hover:underline">
                          {vehicle.plate}
                        </Link>
                        <span className="block text-[12px] text-fg-tertiary">
                          {vehicle.make} {vehicle.model}{vehicle.colour === null ? '' : ` · ${vehicle.colour}`}{vehicle.year === null ? '' : ` · ${String(vehicle.year)}`}
                        </span>
                      </td>
                      <td className="px-4 py-3"><TierBadge tier={vehicle.tier} /></td>
                      <td className="px-4 py-3 text-fg-secondary">
                        {vehicle.currentCourierName ?? vehicle.currentCourierId ?? <span className="text-fg-tertiary">—</span>}
                      </td>
                      <td className="px-4 py-3">
                        <StatusPill status={vehicleStatusTone(vehicle.status)} label={overdue ? 'Overdue' : VEHICLE_STATUS_LABEL[vehicle.status]} className={cn(overdue && 'bg-danger-subtle text-fg-danger')} />
                        {vehicle.status === 'assigned' && vehicle.shiftDueBackAt !== null && (
                          <span className={cn('tabular block text-[12px]', overdue ? 'text-fg-danger' : 'text-fg-tertiary')} title={formatDateTime(vehicle.shiftDueBackAt)}>
                            {overdue ? `${formatDuration(secondsSince(vehicle.shiftDueBackAt))} late` : `due back ${formatDateTime(vehicle.shiftDueBackAt)}`}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-fg-secondary">{vehicle.homeDepotName ?? vehicle.homeDepotId ?? <span className="text-fg-tertiary">—</span>}</td>
                      <td className="tabular px-4 py-3 text-right">{vehicle.mileageKm.toLocaleString('en-NG')} km</td>
                      <td className="tabular whitespace-nowrap px-4 py-3">
                        <ServiceDue iso={vehicle.nextServiceDue} />
                      </td>
                      <td className="px-4 py-3">
                        {vehicle.isRoadLegal ? (
                          <span className="text-[12px] font-medium text-fg-success">Yes</span>
                        ) : (
                          <span className="inline-flex rounded-[4px] bg-danger-subtle px-1.5 py-0.5 text-[11px] font-semibold text-fg-danger">No</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {vehicle.status === 'available' && (
                          <Button variant="secondary" size="sm" onClick={() => { setAssigning(vehicle) }}>Assign…</Button>
                        )}
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      )}

      <Pagination list={list} firstPageLabel="By plate" />

      <RegisterVehicleDialog open={registering} onClose={() => { setRegistering(false) }} />
      {assigning !== null && <AssignVehicleDialog key={assigning.vehicleId} vehicle={assigning} open onClose={() => { setAssigning(null) }} />}
    </div>
  )
}

/** The next service date, red once it has passed and amber inside a fortnight. */
export function ServiceDue({ iso }: { readonly iso: string | null }) {
  if (iso === null) {
    return <span className="text-fg-tertiary">—</span>
  }

  const daysLeft = Math.floor((new Date(iso).getTime() - Date.now()) / 86_400_000)

  return (
    <span className={cn(daysLeft < 0 ? 'font-medium text-fg-danger' : daysLeft <= 14 ? 'text-fg-warning' : 'text-fg-secondary')}>
      {formatDate(iso)}
      {daysLeft < 0 && ' · overdue'}
    </span>
  )
}
