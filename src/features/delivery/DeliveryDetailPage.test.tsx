import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { clearSession, setSession } from '../../lib/auth/session'
import { mockApi, renderRoute } from '../../test/router'
import { DeliveryDetailPage } from './DeliveryDetailPage'
import { type DeliveryOverview } from './api'

const overview: DeliveryOverview = {
  delivery: {
    deliveryId: 'dlv_01',
    reference: 'ODL-7K3M9P',
    state: 'Collected',
    version: 7,
    eventSeq: 9,
    tier: 'Van',
    senderId: 'usr_1',
    senderName: 'Adaeze Nnamdi',
    senderPhone: '+234 80• ••• 1234',
    senderEmail: 'adaeze@example.ng',
    recipientName: 'Tunde Bakare',
    recipientPhone: '+234 81• ••• 9876',
    pickupLabel: '14 Oba Akran Avenue, Ikeja',
    dropoffLabel: '3 Admiralty Way, Lekki',
    item: { category: 'electronics', weightKg: 12.5, lengthCm: 60, widthCm: 40, heightCm: 30, declaredValueMinor: 45_000_000, description: 'Monitor, boxed' },
    handling: ['fragile', 'stairs'],
    notes: null,
    leaveAtDoor: false,
    quotedFareMinor: 412_000,
    finalFareMinor: null,
    currency: 'NGN',
    breakdown: {
      baseFareMinor: 250_000,
      distanceChargeMinor: 112_000,
      handlingMinor: 50_000,
      waitingMinor: 0,
      returnLegMinor: 0,
      cancellationFeeMinor: 0,
      totalMinor: 412_000,
      commissionMinor: 82_400,
      courierNetMinor: 329_600,
      currency: 'NGN',
      pricingRuleVersion: 'delivery-v1',
    },
    courierId: 'drv_9',
    vehicleId: 'veh_3',
    vehiclePlate: 'LND-482-KJA',
    pickupCode: 'K7M2',
    pickupCodeStatus: { verified: true, attempts: 1, locked: false, verifiedAt: '2026-09-09T09:31:00Z', sentAt: null, waived: false, overriddenBy: null, overrideReason: null },
    deliveryCodeStatus: { verified: false, attempts: 3, locked: true, verifiedAt: null, sentAt: '2026-09-09T09:32:00Z', waived: false, overriddenBy: null, overrideReason: null },
    pickupPhoto: null,
    deliveryPhoto: null,
    pickupAttempts: 1,
    deliveryAttempts: 1,
    exceptions: [],
    timeline: [
      { eventSeq: 1, eventType: 'delivery.booked', state: 'Quoted', actorId: 'usr_1', actorRole: 'sender', vehicleId: null, occurredAt: '2026-09-09T08:58:00Z', detail: null },
      { eventSeq: 2, eventType: 'delivery.paid', state: 'Paid', actorId: null, actorRole: null, vehicleId: null, occurredAt: '2026-09-09T09:00:00Z', detail: 'Ercaspay ERC-1' },
      { eventSeq: 5, eventType: 'delivery.collected', state: 'Collected', actorId: 'drv_9', actorRole: 'courier', vehicleId: 'veh_3', occurredAt: '2026-09-09T09:31:00Z', detail: null },
    ],
    zoneId: 'lagos-ikeja',
    depotId: null,
    depotHeldSince: null,
    bookedAt: '2026-09-09T08:58:00Z',
    paidAt: '2026-09-09T09:00:00Z',
    assignedAt: '2026-09-09T09:05:00Z',
    collectedAt: '2026-09-09T09:31:00Z',
    inTransitAt: null,
    deliveredAt: null,
    settledAt: null,
    closedAt: null,
    cancellationReason: null,
    cancelledBy: null,
    paymentReference: 'ERC-1',
    estimatedDistanceM: 18_400,
    estimatedDurationS: 2_700,
  },
  courier: { driverId: 'drv_9', displayName: 'Musa Ibrahim', phoneMasked: '+234 70• ••• 4321' },
  settlement: null,
  unavailableSections: ['settlement'],
}

describe('DeliveryDetailPage', () => {
  beforeEach(() => {
    setSession('tok_test', 900)
  })

  afterEach(() => {
    clearSession()
    vi.unstubAllGlobals()
  })

  it('renders both codes with their attempts, the custody timeline and the unavailable-sections banner', async () => {
    mockApi({
      'GET /v1/admin/deliveries/dlv_01': () => overview,
      'GET /v1/admin/deliveries/claims': () => ({ items: [], nextCursor: null }),
    })

    renderRoute('/delivery/dlv_01', [{ path: '/delivery/$deliveryId', component: DeliveryDetailPage }])

    expect(await screen.findByRole('heading', { level: 1, name: 'ODL-7K3M9P' })).toBeInTheDocument()

    // Pickup: verified on the first go, and the code itself is shown to ops.
    const pickup = screen.getByText('Pickup code').closest('div')!.parentElement!
    expect(within(pickup).getByText('K7M2')).toBeInTheDocument()
    expect(within(pickup).getByText('Verified')).toBeInTheDocument()
    expect(within(pickup).getByText('1 of 3')).toBeInTheDocument()

    // Delivery: three wrong attempts, locked.
    const delivery = screen.getByText('Delivery code').closest('div')!.parentElement!
    expect(within(delivery).getByText('Locked')).toBeInTheDocument()
    expect(within(delivery).getByText('3 of 3')).toBeInTheDocument()

    // The custody record, with actor and vehicle.
    expect(screen.getByText('delivery.collected')).toBeInTheDocument()
    expect(screen.getByText(/courier drv_9 · vehicle veh_3/)).toBeInTheDocument()
    expect(screen.getByText('Ercaspay ERC-1')).toBeInTheDocument()

    // Named, so nobody mistakes the missing settlement for "nothing settled".
    expect(screen.getByText(/Could not load: settlement/)).toBeInTheDocument()
    expect(screen.getByText('Musa Ibrahim')).toBeInTheDocument()
  })

  it('keeps the override disabled until the reason is long enough and verification is ticked, then posts it', async () => {
    const user = userEvent.setup()
    const api = mockApi({
      'GET /v1/admin/deliveries/dlv_01': () => overview,
      'GET /v1/admin/deliveries/claims': () => ({ items: [], nextCursor: null }),
      'POST /v1/admin/deliveries/dlv_01/override-code': () => overview,
    })

    renderRoute('/delivery/dlv_01', [{ path: '/delivery/$deliveryId', component: DeliveryDetailPage }])

    await user.click(await screen.findByRole('button', { name: 'Override locked code…' }))

    const dialog = screen.getByRole('dialog')
    const submit = within(dialog).getByRole('button', { name: 'Override delivery code' })

    // Only the locked code is selectable; the pickup code was verified and stays greyed out.
    expect(within(dialog).getByRole('radio', { name: /Delivery code/ })).toHaveAttribute('aria-checked', 'true')
    expect(within(dialog).getByRole('radio', { name: /Pickup code/ })).toBeDisabled()

    expect(submit).toBeDisabled()

    await user.type(within(dialog).getByLabelText('Reason (required)'), 'too short')
    expect(submit).toBeDisabled()

    await user.type(within(dialog).getByLabelText('Reason (required)'), ' — recipient confirmed the reference by phone')
    expect(submit).toBeDisabled()

    await user.click(within(dialog).getByRole('checkbox'))
    expect(submit).toBeEnabled()

    await user.click(submit)

    await waitFor(() => {
      expect(api.seen.some((request) => request.method === 'POST' && request.path === '/v1/admin/deliveries/dlv_01/override-code')).toBe(true)
    })

    const posted = api.seen.find((request) => request.method === 'POST')!
    expect(posted.body).toEqual({ codeKind: 'delivery', reason: 'too short — recipient confirmed the reference by phone', verified: true })
    expect(posted.headers.get('Idempotency-Key')).toMatch(/^[0-9a-f-]{36}$/)
  })
})
