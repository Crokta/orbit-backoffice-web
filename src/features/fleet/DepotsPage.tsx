import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { useState } from 'react'

import { Button } from '../../components/ui/Button'
import { LoadError } from '../../components/ui/LoadError'
import { cn } from '../../components/ui/cn'
import { DepotDialog } from './FleetDialogs'
import { type Depot, fleetApi, fleetKeys } from './api'

const HEADERS = ['Depot', 'Zone', 'Vehicles home', 'Status', 'Held items', ''] as const

/**
 * Depots (REQ128): where held items sit and where fleet vehicles go home to.
 *
 * What is physically held at each one is the exceptions queue's `held_at_depot` view,
 * narrowed to the depot — one record of custody, not a second copy kept here.
 */
export function DepotsPage() {
  const depots = useQuery({ queryKey: fleetKeys.depots(), queryFn: fleetApi.depots })
  const [editing, setEditing] = useState<Depot | null | 'new'>(null)

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-[12px]"><Link to="/fleet" className="text-fg-brand hover:underline">Fleet</Link></p>
          <h1 className="text-[22px] font-semibold leading-[28px]">Depots</h1>
          <p className="mt-0.5 text-[13px] text-fg-secondary">Each depot's held items are on the exceptions queue, so the shelves can be reconciled against the system.</p>
        </div>
        <Button onClick={() => { setEditing('new') }}>Add depot</Button>
      </header>

      {depots.isError ? (
        <LoadError error={depots.error} what="the depot list" onRetry={() => { void depots.refetch() }} />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-line-subtle bg-surface">
          <table className="w-full min-w-[760px] border-collapse text-[13px]">
            <thead>
              <tr className="border-b border-line-subtle">
                {HEADERS.map((header, index) => (
                  <th
                    key={header.length === 0 ? 'actions' : header}
                    scope="col"
                    className={cn('px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-fg-tertiary', index === 2 && 'text-right')}
                  >
                    {header}
                  </th>
                ))}
              </tr>
            </thead>

            <tbody>
              {depots.isPending ? (
                <tr><td colSpan={HEADERS.length} className="px-4 py-10 text-center text-fg-tertiary">Loading…</td></tr>
              ) : depots.data.length === 0 ? (
                <tr><td colSpan={HEADERS.length} className="px-4 py-10 text-center text-fg-tertiary">No depot has been set up.</td></tr>
              ) : (
                depots.data.map((depot) => (
                  <tr key={depot.depotId} className="border-b border-line-subtle last:border-0 hover:bg-hover">
                    <td className="px-4 py-3">
                      <p className="font-medium">{depot.name}</p>
                      <p className="text-[12px] text-fg-tertiary">{depot.address}</p>
                      <p className="tabular text-[11px] text-fg-tertiary">{depot.depotId} · {depot.lat.toFixed(4)}, {depot.lng.toFixed(4)}</p>
                    </td>
                    <td className="tabular px-4 py-3 text-fg-secondary">{depot.zoneId ?? <span className="text-fg-tertiary">—</span>}</td>
                    <td className="tabular px-4 py-3 text-right">{depot.vehiclesHome.toLocaleString('en-NG')}</td>
                    <td className="px-4 py-3">
                      {depot.isActive ? (
                        <span className="inline-flex rounded-[4px] bg-success-subtle px-1.5 py-0.5 text-[11px] font-semibold text-fg-success">Active</span>
                      ) : (
                        <span className="inline-flex rounded-[4px] bg-subtle px-1.5 py-0.5 text-[11px] font-semibold text-fg-tertiary">Inactive</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <Link
                        to="/deliveries/exceptions"
                        search={{ kind: 'held_at_depot', depotId: depot.depotId }}
                        className="text-[13px] font-medium text-fg-brand hover:underline"
                      >
                        Items held here →
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Button variant="secondary" size="sm" onClick={() => { setEditing(depot) }}>Edit…</Button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {editing !== null && (
        <DepotDialog key={editing === 'new' ? 'new' : editing.depotId} depot={editing === 'new' ? null : editing} open onClose={() => { setEditing(null) }} />
      )}
    </div>
  )
}
