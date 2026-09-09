import { useQuery } from '@tanstack/react-query'
import { Link, useParams } from '@tanstack/react-router'
import { useState } from 'react'

import { Button } from '../../components/ui/Button'
import { Notice } from '../../components/ui/Inputs'
import { LoadError } from '../../components/ui/LoadError'
import { Money } from '../../components/ui/Money'
import { StatusPill } from '../../components/ui/StatusPill'
import { cn } from '../../components/ui/cn'
import { formatDate, formatDateTime, formatDuration, secondsSince } from '../../lib/format'
import { usePagedList } from '../../lib/paging'
import { Panel, Row } from '../corporate/CorporateWidgets'
import { TierBadge } from '../delivery/DeliveryWidgets'
import { Pagination } from '../shared/ListControls'
import { AssignVehicleDialog, EditVehicleDialog, ReportDamageDialog, ReturnVehicleDialog } from './FleetDialogs'
import { ServiceDue } from './FleetPage'
import {
  ASSIGNMENT_STATUS_LABEL,
  type ConditionCheck,
  FUEL_LABEL,
  SEVERITY_LABEL,
  VEHICLE_STATUS_LABEL,
  type VehicleAssignment,
  assignmentStatusTone,
  fleetApi,
  fleetKeys,
  isOverdue,
  vehicleStatusTone,
} from './api'

type Dialog = 'edit' | 'assign' | 'return' | 'damage' | null

/**
 * One vehicle: what it is, who has it, and every shift it has been out on.
 *
 * Damage is reported against a shift, never against the vehicle alone (REQ124) — the
 * courier who had it is the point.
 */
export function VehiclePage() {
  const { vehicleId } = useParams({ from: '/authenticated/fleet/vehicle/$vehicleId' })

  const vehicle = useQuery({ queryKey: fleetKeys.vehicle(vehicleId), queryFn: () => fleetApi.vehicle(vehicleId) })

  const history = usePagedList({
    key: fleetKeys.assignments(vehicleId),
    filters: { vehicleId },
    fetchPage: (params) => fleetApi.assignments(params),
    initialLimit: 25,
  })

  const [dialog, setDialog] = useState<Dialog>(null)
  const [damageFor, setDamageFor] = useState<VehicleAssignment | null>(null)

  if (vehicle.isError) {
    return <LoadError error={vehicle.error} what="this vehicle" onRetry={() => { void vehicle.refetch() }} />
  }

  if (vehicle.isPending) {
    return <p className="text-[13px] text-fg-tertiary">Loading vehicle…</p>
  }

  const v = vehicle.data
  const overdue = isOverdue(v)
  const onShift = v.status === 'assigned' && v.currentAssignmentId !== null

  return (
    <div className="max-w-5xl space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-[12px]"><Link to="/fleet" className="text-fg-brand hover:underline">Fleet</Link></p>
          <h1 className="tabular text-[22px] font-semibold leading-[28px]">{v.plate}</h1>
          <p className="mt-1 flex flex-wrap items-center gap-2 text-[13px] text-fg-secondary">
            <StatusPill status={vehicleStatusTone(v.status)} label={overdue ? 'Overdue' : VEHICLE_STATUS_LABEL[v.status]} className={cn(overdue && 'bg-danger-subtle text-fg-danger')} />
            <TierBadge tier={v.tier} />
            <span>{v.make} {v.model}{v.colour === null ? '' : ` · ${v.colour}`}{v.year === null ? '' : ` · ${String(v.year)}`}</span>
            <span className="tabular text-fg-tertiary">{v.vehicleId}</span>
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button variant="secondary" size="sm" onClick={() => { setDialog('edit') }}>Edit…</Button>
          {v.status === 'available' && <Button size="sm" onClick={() => { setDialog('assign') }}>Assign to courier…</Button>}
          {onShift && <Button size="sm" onClick={() => { setDialog('return') }}>Return…</Button>}
          {onShift && <Button variant="danger" size="sm" onClick={() => { setDialog('damage') }}>Report damage…</Button>}
        </div>
      </header>

      {!v.isRoadLegal && (
        <Notice tone="danger" title="Not road-legal">
          Insurance{v.insuranceExpiresAt === null ? '' : ` (expires ${formatDate(v.insuranceExpiresAt)})`} or roadworthiness
          {v.roadworthinessExpiresAt === null ? '' : ` (expires ${formatDate(v.roadworthinessExpiresAt)})`} has lapsed. Dispatch will not offer this vehicle jobs.
        </Notice>
      )}

      {overdue && v.shiftDueBackAt !== null && (
        <Notice tone="warning" title={`${formatDuration(secondsSince(v.shiftDueBackAt))} past its due-back time`}>
          {v.currentCourierName ?? v.currentCourierId ?? 'The courier'} was due back at {formatDateTime(v.shiftDueBackAt)}. Record the return when it arrives, or report it if it does not.
        </Notice>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <Panel title="Current shift">
          {v.status !== 'assigned' ? (
            <p className="text-[13px] text-fg-tertiary">Not on a shift.</p>
          ) : (
            <dl>
              <Row label="Courier" value={v.currentCourierName ?? v.currentCourierId ?? '—'} />
              <Row label="Courier id" value={v.currentCourierId ?? '—'} mono />
              <Row label="Started" value={formatDateTime(v.shiftStartedAt)} />
              <Row label="Due back" value={formatDateTime(v.shiftDueBackAt)} tone={overdue ? 'danger' : 'neutral'} />
              <Row label="Assignment" value={v.currentAssignmentId ?? '—'} mono />
            </dl>
          )}
        </Panel>

        <Panel title="Vehicle">
          <dl>
            <Row label="Home depot" value={v.homeDepotName ?? v.homeDepotId ?? '—'} />
            <Row label="Mileage" value={`${v.mileageKm.toLocaleString('en-NG')} km`} mono />
            <Row label="Next service" value={<ServiceDue iso={v.nextServiceDue} />} />
            <Row label="Insurance expires" value={formatDate(v.insuranceExpiresAt)} tone={expiryTone(v.insuranceExpiresAt)} />
            <Row label="Roadworthiness expires" value={formatDate(v.roadworthinessExpiresAt)} tone={expiryTone(v.roadworthinessExpiresAt)} />
            <Row label="Road-legal" value={v.isRoadLegal ? 'Yes' : 'No'} tone={v.isRoadLegal ? 'success' : 'danger'} />
          </dl>
        </Panel>
      </div>

      <Panel title="Shift history" subtitle="Every assignment, with the condition it left in and came back in.">
        {history.query.isError ? (
          <p className="text-[13px] text-fg-danger">The history could not be loaded.</p>
        ) : history.query.isPending ? (
          <p className="text-[13px] text-fg-tertiary">Loading…</p>
        ) : history.items.length === 0 ? (
          <p className="text-[13px] text-fg-tertiary">This vehicle has never been out.</p>
        ) : (
          <ul className="divide-y divide-line-subtle">
            {history.items.map((assignment) => (
              <li key={assignment.assignmentId} className="py-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[13px]">
                      <span className="font-medium">{assignment.courierName ?? assignment.courierId}</span>
                      <span className="tabular text-fg-tertiary"> · {assignment.courierId}</span>
                    </p>
                    <p className="tabular text-[12px] text-fg-tertiary">
                      {formatDateTime(assignment.startedAt)} → {assignment.returnedAt === null ? `due ${formatDateTime(assignment.dueBackAt)}` : formatDateTime(assignment.returnedAt)}
                      {' · '}by {assignment.assignedBy}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <StatusPill status={assignmentStatusTone(assignment.status)} label={ASSIGNMENT_STATUS_LABEL[assignment.status]} />
                    <Button variant="ghost" size="sm" onClick={() => { setDamageFor(assignment) }}>Report damage…</Button>
                  </div>
                </div>

                <div className="mt-2 grid gap-3 text-[12px] sm:grid-cols-2">
                  <CheckSummary label="Check-out" check={assignment.checkOut} />
                  <CheckSummary label="Check-in" check={assignment.checkIn} />
                </div>

                {assignment.damage.length > 0 && (
                  <ul className="mt-2 space-y-1">
                    {assignment.damage.map((report) => (
                      <li key={report.reportId} className="rounded bg-danger-subtle/50 px-2.5 py-1.5 text-[12px] text-fg-danger">
                        <span className="font-semibold">{SEVERITY_LABEL[report.severity]}</span> — {report.description}
                        <span className="tabular"> · est. <Money minorUnits={report.estimatedCostMinor} currency={report.currency} /> · {report.reportedBy}, {formatDateTime(report.reportedAt)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        )}
        <Pagination list={history} className="mt-3" />
      </Panel>

      {dialog === 'edit' && <EditVehicleDialog key={v.vehicleId} vehicle={v} open onClose={() => { setDialog(null) }} />}
      {dialog === 'assign' && <AssignVehicleDialog vehicle={v} open onClose={() => { setDialog(null) }} />}
      {dialog === 'return' && <ReturnVehicleDialog vehicle={v} open onClose={() => { setDialog(null) }} />}
      {dialog === 'damage' && v.currentAssignmentId !== null && (
        <ReportDamageDialog assignmentId={v.currentAssignmentId} plate={v.plate} courierName={v.currentCourierName} open onClose={() => { setDialog(null) }} />
      )}
      {damageFor !== null && (
        <ReportDamageDialog
          key={damageFor.assignmentId}
          assignmentId={damageFor.assignmentId}
          plate={damageFor.vehiclePlate}
          courierName={damageFor.courierName ?? damageFor.courierId}
          open
          onClose={() => { setDamageFor(null) }}
        />
      )}
    </div>
  )
}

function CheckSummary({ label, check }: { readonly label: string; readonly check: ConditionCheck | null }) {
  if (check === null) {
    return (
      <p className="text-fg-tertiary"><span className="font-medium text-fg-secondary">{label}</span> · not recorded</p>
    )
  }

  const problems = [
    !check.lightsOk && 'lights',
    !check.tyresOk && 'tyres',
    !check.bodyworkOk && 'bodywork',
    !check.loadAreaClean && 'load area',
  ].filter((problem): problem is string => typeof problem === 'string')

  return (
    <p className="text-fg-secondary">
      <span className="font-medium">{label}</span>
      <span className="tabular"> · {check.mileageKm.toLocaleString('en-NG')} km · fuel {FUEL_LABEL[check.fuelLevel]}</span>
      {problems.length === 0 ? <span className="text-fg-success"> · all clear</span> : <span className="text-fg-danger"> · {problems.join(', ')} flagged</span>}
      {check.notes.length > 0 && <span className="block text-fg-tertiary">“{check.notes}”</span>}
    </p>
  )
}

function expiryTone(iso: string | null): 'neutral' | 'warning' | 'danger' {
  if (iso === null) {
    return 'neutral'
  }

  const daysLeft = (new Date(iso).getTime() - Date.now()) / 86_400_000

  return daysLeft < 0 ? 'danger' : daysLeft <= 30 ? 'warning' : 'neutral'
}
