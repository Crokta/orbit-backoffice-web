import { type Status } from '../../components/ui/StatusPill'
import { api, newIdempotencyKey } from '../../lib/api/client'
import { type Page } from '../../lib/paging'
import { type Tier } from '../delivery/api'

/**
 * Everything the fleet module calls, typed once.
 *
 * The shapes mirror the admin BFF's `/v1/admin/fleet` records, which mirror the user
 * service's FleetService messages in camelCase.
 */

export const VEHICLE_STATUSES = ['available', 'assigned', 'maintenance', 'retired'] as const

export type VehicleStatus = (typeof VEHICLE_STATUSES)[number]

export const FUEL_LEVELS = ['empty', 'quarter', 'half', 'three_quarters', 'full'] as const

export type FuelLevel = (typeof FUEL_LEVELS)[number]

export const DAMAGE_SEVERITIES = ['minor', 'major', 'unroadworthy'] as const

export type DamageSeverity = (typeof DAMAGE_SEVERITIES)[number]

export type AssignmentStatus = 'active' | 'returned' | 'overdue'

export interface Depot {
  readonly depotId: string
  readonly name: string
  readonly address: string
  readonly lat: number
  readonly lng: number
  readonly zoneId: string | null
  readonly isActive: boolean
  readonly vehiclesHome: number
  readonly createdAt: string | null
}

export interface FleetVehicle {
  readonly vehicleId: string
  readonly plate: string
  readonly tier: Tier
  readonly make: string
  readonly model: string
  readonly colour: string | null
  readonly year: number | null
  readonly homeDepotId: string | null
  readonly homeDepotName: string | null
  readonly mileageKm: number
  readonly nextServiceDue: string | null
  readonly insuranceExpiresAt: string | null
  readonly roadworthinessExpiresAt: string | null
  readonly status: VehicleStatus
  readonly currentCourierId: string | null
  readonly currentCourierName: string | null
  readonly currentAssignmentId: string | null
  readonly shiftStartedAt: string | null
  readonly shiftDueBackAt: string | null
  readonly isRoadLegal: boolean
}

export interface ConditionCheck {
  readonly mileageKm: number
  readonly fuelLevel: FuelLevel
  readonly lightsOk: boolean
  readonly tyresOk: boolean
  readonly bodyworkOk: boolean
  readonly loadAreaClean: boolean
  readonly notes: string
}

export interface DamageReport {
  readonly reportId: string
  readonly description: string
  readonly severity: DamageSeverity
  readonly reportedBy: string
  readonly reportedAt: string
  readonly photoIds: readonly string[]
  readonly estimatedCostMinor: number
  readonly currency: string
}

export interface VehicleAssignment {
  readonly assignmentId: string
  readonly vehicleId: string
  readonly vehiclePlate: string
  readonly tier: Tier
  readonly courierId: string
  readonly courierName: string | null
  readonly depotId: string | null
  readonly startedAt: string
  readonly dueBackAt: string
  readonly returnedAt: string | null
  readonly checkOut: ConditionCheck | null
  readonly checkIn: ConditionCheck | null
  readonly damage: readonly DamageReport[]
  readonly assignedBy: string
  readonly returnedBy: string | null
  readonly status: AssignmentStatus
}

export interface VehicleListFilters {
  readonly q: string | undefined
  readonly tier: Tier | undefined
  readonly status: VehicleStatus | undefined
  readonly depotId: string | undefined
}

export interface NewVehicle {
  readonly plate: string
  readonly tier: Tier
  readonly make: string
  readonly model: string
  readonly colour?: string
  readonly year?: number
  readonly homeDepotId: string
  readonly mileageKm: number
  readonly nextServiceDue?: string
  readonly insuranceExpiresAt?: string
  readonly roadworthinessExpiresAt?: string
}

export interface VehiclePatch {
  readonly homeDepotId?: string
  readonly mileageKm?: number
  readonly nextServiceDue?: string
  readonly status?: Exclude<VehicleStatus, 'assigned'>
  readonly insuranceExpiresAt?: string
  readonly roadworthinessExpiresAt?: string
}

export interface DepotInput {
  readonly name: string
  readonly address: string
  readonly lat: number
  readonly lng: number
  readonly zoneId?: string
  readonly isActive: boolean
}

const BASE = '/v1/admin/fleet'

export const fleetApi = {
  depots: async () => {
    const response = await api.get<{ readonly depots: readonly Depot[] } | readonly Depot[]>(`${BASE}/depots`)
    // The BFF wraps the list the way the gRPC response does; a bare array is tolerated so
    // that a depot dropdown never comes up empty over a shape that changed.
    return 'depots' in response ? response.depots : response
  },

  createDepot: (body: DepotInput) => api.post<Depot>(`${BASE}/depots`, { json: body, idempotencyKey: newIdempotencyKey() }),

  updateDepot: (depotId: string, body: DepotInput) =>
    api.put<Depot>(`${BASE}/depots/${encodeURIComponent(depotId)}`, { json: body, idempotencyKey: newIdempotencyKey() }),

  vehicles: (params: VehicleListFilters & { readonly cursor: string | undefined; readonly limit: number }) =>
    api.get<Page<FleetVehicle>>(`${BASE}/vehicles`, {
      query: { q: params.q, tier: params.tier, status: params.status, depotId: params.depotId, cursor: params.cursor, limit: params.limit },
    }),

  vehicle: (vehicleId: string) => api.get<FleetVehicle>(`${BASE}/vehicles/${encodeURIComponent(vehicleId)}`),

  registerVehicle: (body: NewVehicle) => api.post<FleetVehicle>(`${BASE}/vehicles`, { json: body, idempotencyKey: newIdempotencyKey() }),

  updateVehicle: (vehicleId: string, body: VehiclePatch) =>
    api.patch<FleetVehicle>(`${BASE}/vehicles/${encodeURIComponent(vehicleId)}`, { json: body, idempotencyKey: newIdempotencyKey() }),

  assign: (vehicleId: string, body: { readonly courierId: string; readonly dueBackAt: string; readonly checkOut: ConditionCheck }) =>
    api.post<VehicleAssignment>(`${BASE}/vehicles/${encodeURIComponent(vehicleId)}/assign`, { json: body, idempotencyKey: newIdempotencyKey() }),

  returnVehicle: (assignmentId: string, body: { readonly checkIn: ConditionCheck }) =>
    api.post<VehicleAssignment>(`${BASE}/assignments/${encodeURIComponent(assignmentId)}/return`, { json: body, idempotencyKey: newIdempotencyKey() }),

  reportDamage: (assignmentId: string, body: { readonly description: string; readonly severity: DamageSeverity; readonly estimatedCostMinor: number }) =>
    api.post<VehicleAssignment>(`${BASE}/assignments/${encodeURIComponent(assignmentId)}/damage`, { json: body, idempotencyKey: newIdempotencyKey() }),

  assignments: (params: { readonly vehicleId?: string; readonly courierId?: string; readonly status?: AssignmentStatus; readonly cursor: string | undefined; readonly limit: number }) =>
    api.get<Page<VehicleAssignment>>(`${BASE}/assignments`, {
      query: { vehicleId: params.vehicleId, courierId: params.courierId, status: params.status, cursor: params.cursor, limit: params.limit },
    }),
}

export const fleetKeys = {
  all: ['fleet'] as const,
  depots: () => ['fleet', 'depots'] as const,
  vehicles: () => ['fleet', 'vehicles'] as const,
  vehicle: (vehicleId: string) => ['fleet', 'vehicle', vehicleId] as const,
  assignments: (vehicleId: string) => ['fleet', 'assignments', vehicleId] as const,
}

// --- Presentation helpers ----------------------------------------------------------------

export const VEHICLE_STATUS_LABEL: Record<VehicleStatus, string> = {
  available: 'Available',
  assigned: 'On shift',
  maintenance: 'In maintenance',
  retired: 'Retired',
}

export function vehicleStatusTone(status: VehicleStatus): Status {
  switch (status) {
    case 'available':
      return 'online'
    case 'assigned':
      return 'in-trip'
    case 'maintenance':
      return 'arrears'
    case 'retired':
      return 'offline'
  }
}

export const ASSIGNMENT_STATUS_LABEL: Record<AssignmentStatus, string> = {
  active: 'On shift',
  returned: 'Returned',
  overdue: 'Overdue',
}

export function assignmentStatusTone(status: AssignmentStatus): Status {
  switch (status) {
    case 'active':
      return 'in-trip'
    case 'returned':
      return 'completed'
    case 'overdue':
      return 'arrears'
  }
}

export const FUEL_LABEL: Record<FuelLevel, string> = {
  empty: 'Empty',
  quarter: '¼',
  half: '½',
  three_quarters: '¾',
  full: 'Full',
}

export const SEVERITY_LABEL: Record<DamageSeverity, string> = {
  minor: 'Minor — drivable',
  major: 'Major — needs the workshop',
  unroadworthy: 'Unroadworthy — off the road now',
}

/** Overdue when a shift's due-back time has passed and nobody has recorded the return. */
export function isOverdue(vehicle: { readonly status: VehicleStatus; readonly shiftDueBackAt: string | null }, now = Date.now()): boolean {
  return vehicle.status === 'assigned' && vehicle.shiftDueBackAt !== null && new Date(vehicle.shiftDueBackAt).getTime() < now
}
