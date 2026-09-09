import { type Status } from '../../components/ui/StatusPill'
import { api, newIdempotencyKey } from '../../lib/api/client'
import { API_BASE_URL } from '../../lib/api/base-url'
import { ApiError } from '../../lib/api/problem'
import { getAccessToken } from '../../lib/auth/session'
import { type Page } from '../../lib/paging'

/**
 * Everything the delivery module calls, typed once.
 *
 * The shapes mirror the admin BFF's `/v1/admin/deliveries` records field for field, and
 * the BFF mirrors the lifecycle service's DeliveryResponse in camelCase. Money is minor
 * units (kobo) everywhere, as `*Minor` beside a `currency`, the way the lifecycle service's
 * own DeliveryDto spells it.
 */

export const DELIVERY_STATES = [
  'Quoted',
  'Paid',
  'Assigned',
  'Collected',
  'InTransit',
  'Delivered',
  'Settled',
  'PickupFailed',
  'DeliveryFailed',
  'Returned',
  'Cancelled',
] as const

export type DeliveryState = (typeof DELIVERY_STATES)[number]

export const TIERS = ['Bike', 'Van', 'Truck'] as const

export type Tier = (typeof TIERS)[number]

/** One line of the board. Ids for the people; the detail page resolves names. */
export interface DeliveryRow {
  readonly deliveryId: string
  readonly reference: string
  readonly state: DeliveryState
  readonly tier: Tier
  readonly senderId: string | null
  readonly senderName: string
  readonly courierId: string | null
  readonly vehicleId: string | null
  readonly vehiclePlate: string | null
  readonly pickupLabel: string
  readonly dropoffLabel: string
  readonly fareMinor: number
  readonly currency: string
  readonly bookedAt: string
  readonly stateSince: string
  /** Computed by the server at response time, so every row is measured against one clock. */
  readonly secondsInState: number
  readonly hasOpenException: boolean
  readonly codeLocked: boolean
  readonly pickupAttempts: number
  readonly deliveryAttempts: number
}

export interface DeliveryCounts {
  readonly counts: Partial<Record<DeliveryState, number>>
}

export const EXCEPTION_KINDS = ['pickup_failed', 'delivery_failed', 'held_at_depot', 'unassigned', 'reported', 'code_locked'] as const

export type ExceptionKind = (typeof EXCEPTION_KINDS)[number]

export interface ExceptionRow {
  readonly deliveryId: string
  readonly reference: string
  readonly kind: ExceptionKind
  readonly state: DeliveryState
  readonly tier: Tier
  readonly courierId: string | null
  readonly pickupLabel: string
  readonly dropoffLabel: string
  readonly since: string
  readonly daysHeld: number
  readonly depotId: string | null
  readonly note: string | null
  readonly exceptionId: string | null
}

export interface CodeStatus {
  readonly verified: boolean
  readonly attempts: number
  readonly locked: boolean
  readonly verifiedAt: string | null
  readonly sentAt: string | null
  readonly waived: boolean
  readonly overriddenBy: string | null
  readonly overrideReason: string | null
}

export interface PhotoRef {
  readonly photoId: string
  readonly takenAt: string | null
  readonly takenBy: string | null
  readonly kind: 'pickup' | 'delivery' | 'exception'
}

export interface DeliveryException {
  readonly exceptionId: string
  readonly kind: string
  readonly note: string | null
  readonly photoId: string | null
  readonly reportedBy: string | null
  readonly reportedAt: string
  readonly resolvedAt: string | null
  readonly resolution: string | null
  readonly resolvedBy: string | null
}

/** One line of the custody record: a transition, when, who caused it, and the vehicle. */
export interface CustodyEntry {
  readonly eventSeq: number
  readonly eventType: string
  readonly state: DeliveryState
  readonly actorId: string | null
  readonly actorRole: string | null
  readonly vehicleId: string | null
  readonly occurredAt: string
  readonly detail: string | null
}

export interface DeclaredItem {
  readonly category: string
  readonly weightKg: number
  readonly lengthCm: number
  readonly widthCm: number
  readonly heightCm: number
  readonly declaredValueMinor: number
  readonly description: string | null
}

export interface PriceBreakdown {
  readonly baseFareMinor: number
  readonly distanceChargeMinor: number
  readonly handlingMinor: number
  readonly waitingMinor: number
  readonly returnLegMinor: number
  readonly cancellationFeeMinor: number
  readonly totalMinor: number
  readonly commissionMinor: number | null
  readonly courierNetMinor: number | null
  readonly currency: string
  readonly pricingRuleVersion: string | null
}

export interface DeliveryDetail {
  readonly deliveryId: string
  readonly reference: string
  readonly state: DeliveryState
  readonly version: number
  readonly eventSeq: number
  readonly tier: Tier
  readonly senderId: string | null
  readonly senderName: string
  readonly senderPhone: string
  readonly senderEmail: string | null
  readonly recipientName: string
  readonly recipientPhone: string
  readonly pickupLabel: string
  readonly dropoffLabel: string
  readonly item: DeclaredItem | null
  readonly handling: readonly string[]
  readonly notes: string | null
  readonly leaveAtDoor: boolean
  readonly quotedFareMinor: number
  readonly finalFareMinor: number | null
  readonly currency: string
  readonly breakdown: PriceBreakdown | null
  readonly courierId: string | null
  readonly vehicleId: string | null
  readonly vehiclePlate: string | null
  /** Ops only. The BFF masks it for everyone else. */
  readonly pickupCode: string | null
  readonly pickupCodeStatus: CodeStatus
  readonly deliveryCodeStatus: CodeStatus
  readonly pickupPhoto: PhotoRef | null
  readonly deliveryPhoto: PhotoRef | null
  readonly pickupAttempts: number
  readonly deliveryAttempts: number
  readonly exceptions: readonly DeliveryException[]
  readonly timeline: readonly CustodyEntry[]
  readonly zoneId: string | null
  readonly depotId: string | null
  readonly depotHeldSince: string | null
  readonly bookedAt: string
  readonly paidAt: string | null
  readonly assignedAt: string | null
  readonly collectedAt: string | null
  readonly inTransitAt: string | null
  readonly deliveredAt: string | null
  readonly settledAt: string | null
  readonly closedAt: string | null
  readonly cancellationReason: string | null
  readonly cancelledBy: string | null
  readonly paymentReference: string | null
  readonly estimatedDistanceM: number
  readonly estimatedDurationS: number
}

export interface DeliveryCourier {
  readonly driverId: string
  readonly displayName: string
  readonly phoneMasked: string
}

/** What the money did, as the payment service tells it. */
export interface DeliverySettlement {
  readonly status: string
  readonly paidMinor: number
  readonly courierNetMinor: number
  readonly commissionMinor: number
  readonly refundedMinor: number
  readonly currency: string
  /** A refund the ledger owes that no automated flow will make. Somebody has to. */
  readonly manualRefundPending: boolean
  readonly paymentReference: string | null
  readonly settledAt: string | null
}

export interface DeliveryOverview {
  readonly delivery: DeliveryDetail
  readonly courier: DeliveryCourier | null
  readonly settlement: DeliverySettlement | null
  /** Sections that could not be loaded. Named, so nobody mistakes them for absent. */
  readonly unavailableSections: readonly string[]
}

export const CLAIM_STATUSES = ['open', 'submitted', 'accepted', 'rejected', 'recovered', 'closed'] as const

export type ClaimStatus = (typeof CLAIM_STATUSES)[number]

export type ClaimKind = 'loss' | 'damage'

export interface Claim {
  readonly claimId: string
  readonly deliveryId: string
  readonly reference: string
  readonly kind: ClaimKind
  readonly status: ClaimStatus
  readonly description: string
  readonly claimedAmountMinor: number
  readonly recoveredAmountMinor: number | null
  readonly currency: string
  readonly insurerReference: string | null
  /** The custody window the loss or damage falls inside (REQ127). */
  readonly custodyFrom: string | null
  readonly custodyTo: string | null
  readonly courierId: string | null
  readonly photoIds: readonly string[]
  readonly openedBy: string
  readonly openedAt: string
  readonly updatedAt: string
  readonly note: string | null
}

export interface DeliveryListFilters {
  /** A state, `active` for every non-terminal one, or undefined for all. */
  readonly state: string | undefined
  readonly q: string | undefined
  readonly tier: Tier | undefined
  readonly exceptions: boolean | undefined
}

export interface ExceptionListFilters {
  readonly kind: ExceptionKind | undefined
  readonly depotId: string | undefined
}

export interface ClaimListFilters {
  readonly status: ClaimStatus | undefined
  readonly deliveryId: string | undefined
}

export type CodeKind = 'pickup' | 'delivery'

export type ExceptionResolution = 'dismiss' | 'requote' | 'cancel_retain_base' | 'return'

export type DepotEvent = 'received' | 'collected' | 'returned_to_sender' | 'disposed'

const BASE = '/v1/admin/deliveries'

function path(deliveryId: string, suffix = ''): string {
  return `${BASE}/${encodeURIComponent(deliveryId)}${suffix}`
}

export const deliveryApi = {
  list: (params: DeliveryListFilters & { readonly cursor: string | undefined; readonly limit: number }) =>
    api.get<Page<DeliveryRow>>(BASE, {
      query: {
        state: params.state,
        q: params.q,
        tier: params.tier,
        exceptions: params.exceptions === true ? true : undefined,
        cursor: params.cursor,
        limit: params.limit,
      },
    }),

  counts: () => api.get<DeliveryCounts>(`${BASE}/counts`),

  exceptions: (params: ExceptionListFilters & { readonly cursor: string | undefined; readonly limit: number }) =>
    api.get<Page<ExceptionRow>>(`${BASE}/exceptions`, {
      query: { kind: params.kind, depotId: params.depotId, cursor: params.cursor, limit: params.limit },
    }),

  get: (deliveryId: string) => api.get<DeliveryOverview>(path(deliveryId)),

  /**
   * A photograph, as an object URL the page can put in an `<img>`.
   *
   * Fetched with the bearer token, because a plain `src` cannot carry the Authorization
   * header and the gateway rightly refuses without it. The caller owns the URL and revokes
   * it when the image leaves the screen.
   */
  photo: async (deliveryId: string, photoId: string): Promise<string> => {
    const token = getAccessToken()
    const response = await fetch(`${API_BASE_URL}${path(deliveryId, `/photos/${encodeURIComponent(photoId)}`)}`, {
      headers: token === null ? {} : { Authorization: `Bearer ${token}` },
      credentials: 'include',
    })

    if (!response.ok) {
      throw new ApiError({ title: 'The photograph could not be loaded', status: response.status, code: 'delivery.photo_unavailable' })
    }

    return URL.createObjectURL(await response.blob())
  },

  overrideCode: (deliveryId: string, body: { readonly codeKind: CodeKind; readonly reason: string; readonly verified: boolean }) =>
    api.post<DeliveryOverview>(path(deliveryId, '/override-code'), { json: body, idempotencyKey: newIdempotencyKey() }),

  resolveException: (
    deliveryId: string,
    exceptionId: string,
    body: { readonly resolution: ExceptionResolution; readonly quoteToken?: string; readonly note?: string },
  ) =>
    api.post<DeliveryOverview>(path(deliveryId, `/exceptions/${encodeURIComponent(exceptionId)}/resolve`), {
      json: body,
      idempotencyKey: newIdempotencyKey(),
    }),

  cancel: (deliveryId: string, body: { readonly reasonCode: string; readonly note: string }) =>
    api.post<DeliveryOverview>(path(deliveryId, '/cancel'), { json: body, idempotencyKey: newIdempotencyKey() }),

  retryDispatch: (deliveryId: string) =>
    api.post<DeliveryOverview>(path(deliveryId, '/retry-dispatch'), { idempotencyKey: newIdempotencyKey() }),

  depotEvent: (deliveryId: string, body: { readonly event: DepotEvent; readonly depotId?: string; readonly note?: string }) =>
    api.post<DeliveryOverview>(path(deliveryId, '/depot'), { json: body, idempotencyKey: newIdempotencyKey() }),

  claims: (params: ClaimListFilters & { readonly cursor: string | undefined; readonly limit: number }) =>
    api.get<Page<Claim>>(`${BASE}/claims`, {
      query: { status: params.status, deliveryId: params.deliveryId, cursor: params.cursor, limit: params.limit },
    }),

  openClaim: (deliveryId: string, body: { readonly kind: ClaimKind; readonly description: string; readonly claimedAmountMinor: number }) =>
    api.post<Claim>(path(deliveryId, '/claims'), { json: body, idempotencyKey: newIdempotencyKey() }),

  updateClaim: (
    claimId: string,
    body: { readonly status?: ClaimStatus; readonly insurerReference?: string; readonly recoveredAmountMinor?: number; readonly note?: string },
  ) => api.patch<Claim>(`${BASE}/claims/${encodeURIComponent(claimId)}`, { json: body, idempotencyKey: newIdempotencyKey() }),
}

export const deliveryKeys = {
  all: ['deliveries'] as const,
  list: () => ['deliveries', 'list'] as const,
  counts: () => ['deliveries', 'counts'] as const,
  exceptions: () => ['deliveries', 'exceptions'] as const,
  detail: (deliveryId: string) => ['deliveries', 'detail', deliveryId] as const,
  photo: (deliveryId: string, photoId: string) => ['deliveries', 'photo', deliveryId, photoId] as const,
  claims: () => ['deliveries', 'claims'] as const,
}

// --- Presentation helpers shared by the pages --------------------------------------------

export const STATE_LABEL: Record<DeliveryState, string> = {
  Quoted: 'Quoted',
  Paid: 'Awaiting courier',
  Assigned: 'Assigned',
  Collected: 'Collected',
  InTransit: 'In transit',
  Delivered: 'Delivered',
  Settled: 'Settled',
  PickupFailed: 'Pickup failed',
  DeliveryFailed: 'Delivery failed',
  Returned: 'Returned',
  Cancelled: 'Cancelled',
}

/**
 * Which rung of the shared status ramp a delivery state sits on.
 *
 * The ramp is colour and the label is the feature's own: a parcel in transit shares the
 * ride's blue and none of its wording.
 */
export function toStatus(state: DeliveryState): Status {
  switch (state) {
    case 'Assigned':
      return 'online'
    case 'Collected':
    case 'InTransit':
      return 'in-trip'
    case 'Delivered':
    case 'Settled':
      return 'completed'
    case 'PickupFailed':
    case 'DeliveryFailed':
      return 'rejected'
    case 'Returned':
      return 'offline'
    case 'Cancelled':
      return 'cancelled'
    case 'Quoted':
    case 'Paid':
      return 'pending'
  }
}

/** Whether the delivery can still change hands. Terminal states have nothing left to override. */
export function isTerminal(state: DeliveryState): boolean {
  return state === 'Delivered' || state === 'Settled' || state === 'Returned' || state === 'Cancelled'
}

/** Paid and nobody has taken it: the row fleet operations owes an answer on (REQ043). */
export function isUnassigned(row: { readonly state: DeliveryState; readonly courierId: string | null }): boolean {
  return row.state === 'Paid' && row.courierId === null
}

export const EXCEPTION_KIND_LABEL: Record<ExceptionKind, string> = {
  pickup_failed: 'Pickup failed',
  delivery_failed: 'Delivery failed',
  held_at_depot: 'Held at depot',
  unassigned: 'Unassigned',
  reported: 'Reported by courier',
  code_locked: 'Code locked',
}

export const REPORTED_KIND_LABEL: Record<string, string> = {
  item_not_as_declared: 'Item not as declared',
  sender_absent: 'Sender absent',
  recipient_absent: 'Recipient absent',
  address_wrong: 'Wrong address',
  vehicle_problem: 'Vehicle problem',
  other: 'Other',
}

export const RESOLUTION_LABEL: Record<ExceptionResolution, string> = {
  dismiss: 'Dismiss — courier continues',
  requote: 'Re-quote at the right tier',
  cancel_retain_base: 'Cancel, retain the base fare',
  return: 'Return to sender',
}

export const CLAIM_STATUS_LABEL: Record<ClaimStatus, string> = {
  open: 'Open',
  submitted: 'Submitted to insurer',
  accepted: 'Accepted',
  rejected: 'Rejected',
  recovered: 'Recovered',
  closed: 'Closed',
}

export function claimStatusTone(status: ClaimStatus): Status {
  switch (status) {
    case 'open':
    case 'submitted':
      return 'pending'
    case 'accepted':
      return 'online'
    case 'recovered':
      return 'completed'
    case 'rejected':
      return 'rejected'
    case 'closed':
      return 'offline'
  }
}

export const HANDLING_LABEL: Record<string, string> = {
  stairs: 'Stairs',
  two_person_lift: 'Two-person lift',
  fragile: 'Fragile',
}

/** "delivery.code_not_locked — The code is not locked." The code is what support quotes back to engineering. */
export function describeFailure(error: unknown, fallback: string): string {
  if (error instanceof ApiError) {
    if (error.status === 409) {
      return `${error.code} — The delivery changed while you were typing. Reload and check its current state.`
    }

    return error.code === 'unknown' ? error.message : `${error.code} — ${error.message}`
  }

  return error instanceof Error && error.message.length > 0 ? error.message : fallback
}
