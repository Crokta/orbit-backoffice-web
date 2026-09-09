import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { clearSession, setSession } from '../../lib/auth/session'
import { mockApi, renderRoute } from '../../test/router'
import { FleetPage } from './FleetPage'
import { type FleetVehicle } from './api'

function vehicle(overrides: Partial<FleetVehicle>): FleetVehicle {
  return {
    vehicleId: 'veh_1',
    plate: 'LND-482-KJA',
    tier: 'Bike',
    make: 'Bajaj',
    model: 'Boxer 150',
    colour: 'Orange',
    year: 2025,
    homeDepotId: 'dep_ikeja',
    homeDepotName: 'Ikeja depot',
    mileageKm: 12_400,
    nextServiceDue: '2030-01-15T00:00:00Z',
    insuranceExpiresAt: '2030-06-01T00:00:00Z',
    roadworthinessExpiresAt: '2030-06-01T00:00:00Z',
    status: 'available',
    currentCourierId: null,
    currentCourierName: null,
    currentAssignmentId: null,
    shiftStartedAt: null,
    shiftDueBackAt: null,
    isRoadLegal: true,
    ...overrides,
  }
}

const depots = [{ depotId: 'dep_ikeja', name: 'Ikeja depot', address: '14 Oba Akran Avenue', lat: 6.6, lng: 3.35, zoneId: 'lagos-ikeja', isActive: true, vehiclesHome: 2, createdAt: null }]

describe('FleetPage', () => {
  beforeEach(() => {
    setSession('tok_test', 900)
  })

  afterEach(() => {
    clearSession()
    vi.unstubAllGlobals()
  })

  it('renders the vehicles with tier, courier, shift, depot, mileage, service and road-legal', async () => {
    mockApi({
      'GET /v1/admin/fleet/vehicles': () => ({
        items: [
          vehicle({}),
          vehicle({
            vehicleId: 'veh_2',
            plate: 'KJA-901-LND',
            tier: 'Van',
            status: 'assigned',
            currentCourierId: 'drv_9',
            currentCourierName: 'Musa Ibrahim',
            currentAssignmentId: 'asg_1',
            shiftStartedAt: '2026-09-09T06:00:00Z',
            shiftDueBackAt: '2099-01-01T18:00:00Z',
            isRoadLegal: false,
          }),
        ],
        nextCursor: null,
      }),
      'GET /v1/admin/fleet/depots': () => ({ depots }),
    })

    renderRoute('/fleet', [{ path: '/fleet', component: FleetPage }])

    const first = (await screen.findByText('LND-482-KJA')).closest('tr')!
    expect(within(first).getByText('Bike')).toBeInTheDocument()
    expect(within(first).getByText('Available')).toBeInTheDocument()
    expect(within(first).getByText('Ikeja depot')).toBeInTheDocument()
    expect(within(first).getByText('12,400 km')).toBeInTheDocument()
    expect(within(first).getByText('Yes')).toBeInTheDocument()
    expect(within(first).getByRole('button', { name: 'Assign…' })).toBeInTheDocument()

    const second = screen.getByText('KJA-901-LND').closest('tr')!
    expect(within(second).getByText('Musa Ibrahim')).toBeInTheDocument()
    expect(within(second).getByText('On shift')).toBeInTheDocument()
    expect(within(second).getByText(/due back/)).toBeInTheDocument()
    expect(within(second).getByText('No')).toBeInTheDocument()
    expect(within(second).queryByRole('button', { name: 'Assign…' })).not.toBeInTheDocument()
  })

  it('posts the courier, due-back time and check-out condition when a vehicle is assigned', async () => {
    const user = userEvent.setup()
    const api = mockApi({
      'GET /v1/admin/fleet/vehicles': () => ({ items: [vehicle({})], nextCursor: null }),
      'GET /v1/admin/fleet/depots': () => ({ depots }),
      'POST /v1/admin/fleet/vehicles/veh_1/assign': () => ({ assignmentId: 'asg_9' }),
    })

    renderRoute('/fleet', [{ path: '/fleet', component: FleetPage }])

    await user.click(await screen.findByRole('button', { name: 'Assign…' }))

    const dialog = screen.getByRole('dialog')
    const submit = within(dialog).getByRole('button', { name: 'Assign and start shift' })

    // Nothing goes up without a courier.
    expect(submit).toBeDisabled()

    await user.type(within(dialog).getByLabelText('Courier id'), 'drv_9')
    await user.clear(within(dialog).getByLabelText('Mileage (km)'))
    await user.type(within(dialog).getByLabelText('Mileage (km)'), '12480')
    await user.selectOptions(within(dialog).getByLabelText('Fuel level'), 'half')
    await user.click(within(dialog).getByRole('checkbox', { name: 'Tyres sound' }))
    await user.type(within(dialog).getByLabelText('Notes'), 'Rear tyre worn.')

    expect(submit).toBeEnabled()
    await user.click(submit)

    await waitFor(() => {
      expect(api.seen.some((request) => request.method === 'POST')).toBe(true)
    })

    const posted = api.seen.find((request) => request.method === 'POST')!
    expect(posted.path).toBe('/v1/admin/fleet/vehicles/veh_1/assign')
    expect(posted.headers.get('Idempotency-Key')).toMatch(/^[0-9a-f-]{36}$/)

    const body = posted.body as { courierId: string; dueBackAt: string; checkOut: Record<string, unknown> }
    expect(body.courierId).toBe('drv_9')
    expect(new Date(body.dueBackAt).getTime()).toBeGreaterThan(Date.now())
    expect(body.checkOut).toEqual({
      mileageKm: 12_480,
      fuelLevel: 'half',
      lightsOk: true,
      tyresOk: false,
      bodyworkOk: true,
      loadAreaClean: true,
      notes: 'Rear tyre worn.',
    })
  })
})
