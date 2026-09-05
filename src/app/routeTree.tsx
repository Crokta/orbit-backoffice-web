import { type QueryClient } from '@tanstack/react-query'
import { Outlet, createRootRouteWithContext, createRoute, redirect } from '@tanstack/react-router'

import { AppShell } from './AppShell'
import { isSessionValid, refreshAccessToken } from '../lib/auth/session'
import { AuditLogPage } from '../features/controls/AuditLogPage'
import { ComplianceQueuePage } from '../features/compliance/ComplianceQueuePage'
import { DriverKycPage } from '../features/compliance/DriverKycPage'
import { FraudAlertsPage } from '../features/compliance/FraudAlertsPage'
import { LeadsPage } from '../features/growth/LeadsPage'
import { LedgerPage } from '../features/finance/LedgerPage'
import { LiveOpsPage } from '../features/liveops/LiveOpsPage'
import { RideDetailPage } from '../features/liveops/RideDetailPage'
import { RidesPage } from '../features/liveops/RidesPage'
import { CommissionsPage } from '../features/finance/CommissionsPage'
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

const driverKycRoute = createRoute({
  getParentRoute: () => authenticatedRoute,
  path: '/kyc/$driverId',
  component: DriverKycPage,
})

const flatRoutes = [
  { path: '/', component: LiveOpsPage },
  { path: '/rides', component: RidesPage },
  { path: '/compliance', component: ComplianceQueuePage },
  { path: '/fraud', component: FraudAlertsPage },
  { path: '/ledger', component: LedgerPage },
  { path: '/refunds', component: RefundsQueuePage },
  { path: '/commissions', component: CommissionsPage },
  { path: '/surge', component: SurgeControlsPage },
  { path: '/audit', component: AuditLogPage },
  { path: '/leads', component: LeadsPage },
] as const

export const routeTree = rootRoute.addChildren([
  signInRoute,
  authenticatedRoute.addChildren([
    rideDetailRoute,
    driverKycRoute,
    ...flatRoutes.map((route) =>
      createRoute({ getParentRoute: () => authenticatedRoute, path: route.path, component: route.component }),
    ),
  ]),
])
