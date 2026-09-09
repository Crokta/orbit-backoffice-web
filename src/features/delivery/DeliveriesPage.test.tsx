import { screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { clearSession, setSession } from '../../lib/auth/session'
import { mockApi, renderRoute } from '../../test/router'
import { DeliveriesPage } from './DeliveriesPage'
import { type DeliveryRow } from './api'

function row(overrides: Partial<DeliveryRow>): DeliveryRow {
  return {
    deliveryId: 'dlv_01',
    reference: 'ODL-7K3M9P',
    state: 'InTransit',
    tier: 'Bike',
    senderId: 'usr_1',
    senderName: 'Adaeze Nnamdi',
    courierId: 'drv_9',
    vehicleId: 'veh_3',
    vehiclePlate: 'LND-482-KJA',
    pickupLabel: '14 Oba Akran Avenue, Ikeja',
    dropoffLabel: '3 Admiralty Way, Lekki',
    fareMinor: 154_000,
    currency: 'NGN',
    bookedAt: '2026-09-09T09:00:00Z',
    stateSince: '2026-09-09T09:30:00Z',
    secondsInState: 4_380,
    hasOpenException: false,
    codeLocked: false,
    pickupAttempts: 1,
    deliveryAttempts: 0,
    ...overrides,
  }
}

describe('DeliveriesPage', () => {
  beforeEach(() => {
    setSession('tok_test', 900)
  })

  afterEach(() => {
    clearSession()
    vi.unstubAllGlobals()
  })

  it('renders the board rows and their exception flags from the page the server sent', async () => {
    const api = mockApi({
      'GET /v1/admin/deliveries': () => ({
        items: [
          row({}),
          row({ deliveryId: 'dlv_02', reference: 'ODL-QQ22XX', state: 'Collected', hasOpenException: true, codeLocked: true, secondsInState: 90_000, tier: 'Van' }),
          row({ deliveryId: 'dlv_03', reference: 'ODL-NOBODY', state: 'Paid', courierId: null, vehicleId: null, vehiclePlate: null, secondsInState: 45 }),
        ],
        nextCursor: null,
      }),
      'GET /v1/admin/deliveries/counts': () => ({ counts: { Paid: 1, Assigned: 4, Collected: 2, InTransit: 7, PickupFailed: 1, DeliveryFailed: 0, Delivered: 12 } }),
    })

    renderRoute('/deliveries', [{ path: '/deliveries', component: DeliveriesPage }])

    // The rows, in the order they arrived: the server sorts by time in state.
    const first = (await screen.findByText('ODL-7K3M9P')).closest('tr')!
    const second = screen.getByText('ODL-QQ22XX').closest('tr')!
    const third = screen.getByText('ODL-NOBODY').closest('tr')!

    expect(within(first).getByText('In transit')).toBeInTheDocument()
    expect(within(first).getByText('1h 13m')).toBeInTheDocument()
    expect(within(first).getByText('drv_9')).toBeInTheDocument()
    expect(within(first).getByText('LND-482-KJA')).toBeInTheDocument()
    expect(within(first).queryByText('Open exception')).not.toBeInTheDocument()

    // Flags come from the row's own facts, not from a filter run in the browser.
    expect(within(second).getByText('Open exception')).toBeInTheDocument()
    expect(within(second).getByText('Code locked')).toBeInTheDocument()
    expect(within(second).getByText('1d 1h')).toBeInTheDocument()

    expect(within(third).getByText('Unassigned')).toBeInTheDocument()
    expect(within(third).getByText('Awaiting courier')).toBeInTheDocument()

    // The tiles add the server's per-state counts.
    expect(await screen.findByLabelText('In custody: 9')).toBeInTheDocument()
    expect(screen.getByLabelText('Failed: 1')).toBeInTheDocument()

    // The board opens on the live view, and asks the server for it by name.
    const list = api.seen.find((request) => request.path === '/v1/admin/deliveries')!
    expect(list.query.get('state')).toBe('active')
    expect(list.headers.get('Authorization')).toBe('Bearer tok_test')
  })

  it('says so when the board cannot be loaded, rather than showing an empty table', async () => {
    mockApi({
      'GET /v1/admin/deliveries': () =>
        new Response(JSON.stringify({ title: 'Upstream unavailable', status: 503, code: 'lifecycle.unavailable' }), { status: 503 }),
      'GET /v1/admin/deliveries/counts': () => ({ counts: {} }),
    })

    renderRoute('/deliveries', [{ path: '/deliveries', component: DeliveriesPage }])

    expect(await screen.findByRole('alert')).toHaveTextContent('Could not load the deliveries board.')
  })
})
