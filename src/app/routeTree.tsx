import { type QueryClient } from '@tanstack/react-query'
import { Outlet, createRootRouteWithContext, createRoute, redirect } from '@tanstack/react-router'

import { AppShell } from './AppShell'
import { isSessionValid, refreshAccessToken } from '../lib/auth/session'
import { AuditLogPage } from '../features/controls/AuditLogPage'
import { ComplianceQueuePage } from '../features/compliance/ComplianceQueuePage'
import { DriverKycPage } from '../features/compliance/DriverKycPage'
import { FraudAlertsPage } from '../features/compliance/FraudAlertsPage'
import { LeadsPage } from '../features/growth/LeadsPage'
import { LedgerAccountPage } from '../features/finance/LedgerAccountPage'
import { LedgerPage } from '../features/finance/LedgerPage'
import { LiveOpsPage } from '../features/liveops/LiveOpsPage'
import { RideDetailPage } from '../features/liveops/RideDetailPage'
import { RidesPage } from '../features/liveops/RidesPage'
import { CommissionsPage } from '../features/finance/CommissionsPage'
import { CorporateAccountPage } from '../features/corporate/CorporateAccountPage'
import { CorporatePage } from '../features/corporate/CorporatePage'
import { OnboardingPipelinePage } from '../features/corporate/OnboardingPipelinePage'
import { ClaimsPage } from '../features/delivery/ClaimsPage'
import { DeliveriesPage } from '../features/delivery/DeliveriesPage'
import { DeliveryDetailPage } from '../features/delivery/DeliveryDetailPage'
import { ExceptionsPage, exceptionsSearchSchema } from '../features/delivery/ExceptionsPage'
import { DepotsPage } from '../features/fleet/DepotsPage'
import { DriversPage } from '../features/fleet/DriversPage'
import { FleetPage } from '../features/fleet/FleetPage'
import { VehiclePage } from '../features/fleet/VehiclePage'
import { IncidentsPage } from '../features/incidents/IncidentsPage'
import { PayoutsPage } from '../features/finance/PayoutsPage'
import { RefundsQueuePage } from '../features/finance/RefundsQueuePage'
import { SignInPage } from '../features/auth/SignInPage'
import { SurgeControlsPage } from '../features/controls/SurgeControlsPage'

export interface RouterContext {
  readonly queryClient: QueryClient
}

const rootRoute = createRootRouteWithContext<RouterContext>()({ component: () => <Outlet /> })

const signInRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/sign-in',
  component: SignInPage,
})

const authenticatedRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: 'authenticated',
  beforeLoad: async ({ location }) => {
    if (isSessionValid() || (await refreshAccessToken())) {
      return
    }

    // The deep link survives the redirect. A support agent pasted a ride URL into
    // a chat; landing them on a dashboard after signing in loses the thing they
    // were sent.
    // TanStack signals a route redirect by throwing its own control-flow object, not
    // an Error. The lint rule is right in general and wrong about this one API.
    // eslint-disable-next-line @typescript-eslint/only-throw-error
    throw redirect({ to: '/sign-in', search: { redirect: location.href } })
  },
  component: AppShell,
})

// The two detail routes sit on their own path segments rather than under their list
// pages. A nav link to `/compliance` next to a route at `/compliance/drivers/$id` makes
// the router treat the nav link as possibly needing a driverId, which is both a type
// error and a fair description of the ambiguity.
const rideDetailRoute = createRoute({
  getParentRoute: () => authenticatedRoute,
  path: '/ride/$rideId',
  component: RideDetailPage,
})

const ledgerAccountRoute = createRoute({
  getParentRoute: () => authenticatedRoute,
  path: '/ledger/$account',
  component: LedgerAccountPage,
})

const driverKycRoute = createRoute({
  getParentRoute: () => authenticatedRoute,
  path: '/kyc/$driverId',
  component: DriverKycPage,
})

// The pipeline is registered before the account detail so `/corporate/pipeline` matches
// the literal segment rather than being read as a company id.
const corporatePipelineRoute = createRoute({
  getParentRoute: () => authenticatedRoute,
  path: '/corporate/pipeline',
  component: OnboardingPipelinePage,
})

const corporateAccountRoute = createRoute({
  getParentRoute: () => authenticatedRoute,
  path: '/corporate/$companyId',
  component: CorporateAccountPage,
})

// Delivery and fleet. The detail pages sit on their own segments for the reason given
// above; the two delivery sub-lists and the depots list are literal paths registered
// before anything that could read their last segment as an id.
const deliveryDetailRoute = createRoute({
  getParentRoute: () => authenticatedRoute,
  path: '/delivery/$deliveryId',
  component: DeliveryDetailPage,
})

const deliveryExceptionsRoute = createRoute({
  getParentRoute: () => authenticatedRoute,
  path: '/deliveries/exceptions',
  validateSearch: exceptionsSearchSchema,
  component: ExceptionsPage,
})

const deliveryClaimsRoute = createRoute({
  getParentRoute: () => authenticatedRoute,
  path: '/deliveries/claims',
  component: ClaimsPage,
})

const fleetDepotsRoute = createRoute({
  getParentRoute: () => authenticatedRoute,
  path: '/fleet/depots',
  component: DepotsPage,
})

const fleetVehicleRoute = createRoute({
  getParentRoute: () => authenticatedRoute,
  path: '/fleet/vehicle/$vehicleId',
  component: VehiclePage,
})

const flatRoutes = [
  { path: '/', component: LiveOpsPage },
  { path: '/rides', component: RidesPage },
  { path: '/deliveries', component: DeliveriesPage },
  { path: '/drivers', component: DriversPage },
  { path: '/fleet', component: FleetPage },
  { path: '/corporate', component: CorporatePage },
  { path: '/compliance', component: ComplianceQueuePage },
  { path: '/fraud', component: FraudAlertsPage },
  { path: '/ledger', component: LedgerPage },
  { path: '/payouts', component: PayoutsPage },
  { path: '/incidents', component: IncidentsPage },
  { path: '/surge', component: SurgeControlsPage },
  { path: '/audit', component: AuditLogPage },

  { path: '/commissions', component: CommissionsPage },
  { path: '/leads', component: LeadsPage },

  // Reachable, but not in the sidebar. Approvals is a queue you are sent to — from the
  // payout waiting on you, or from a link a colleague pasted — rather than one you go
  // looking for, and it is the same four-eyes queue Payouts already surfaces. A row of
  // its own would be a second front door to one decision.
  { path: '/refunds', component: RefundsQueuePage },
] as const

export const routeTree = rootRoute.addChildren([
  signInRoute,
  authenticatedRoute.addChildren([
    rideDetailRoute,
    ledgerAccountRoute,
    driverKycRoute,
    corporatePipelineRoute,
    corporateAccountRoute,
    deliveryDetailRoute,
    deliveryExceptionsRoute,
    deliveryClaimsRoute,
    fleetDepotsRoute,
    fleetVehicleRoute,
    ...flatRoutes.map((route) =>
      createRoute({ getParentRoute: () => authenticatedRoute, path: route.path, component: route.component }),
    ),
  ]),
])
