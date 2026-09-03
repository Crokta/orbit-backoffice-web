import { type QueryClient } from '@tanstack/react-query'
import { Outlet, createRootRouteWithContext, createRoute, redirect } from '@tanstack/react-router'

import { AppShell } from './AppShell'
import { isSessionValid, refreshAccessToken } from '../lib/auth/session'
import { AuditLogPage } from '../features/controls/AuditLogPage'
import { ComplianceQueuePage } from '../features/compliance/ComplianceQueuePage'
import { DriverKycPage } from '../features/compliance/DriverKycPage'
import { FraudAlertsPage } from '../features/compliance/FraudAlertsPage'
import { LedgerPage } from '../features/finance/LedgerPage'
import { LiveOpsPage } from '../features/liveops/LiveOpsPage'
import { RideDetailPage } from '../features/liveops/RideDetailPage'
import { RidesPage } from '../features/liveops/RidesPage'
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
    throw redirect({ to: '/sign-in', search: { redirect: location.href } })
  },
  component: AppShell,
})

const rideDetailRoute = createRoute({
  getParentRoute: () => authenticatedRoute,
  path: '/rides/$rideId',
  component: RideDetailPage,
})

const flatRoutes = [
  { path: '/', component: LiveOpsPage },
  { path: '/rides', component: RidesPage },
  { path: '/compliance', component: ComplianceQueuePage },
  { path: '/compliance/drivers/$driverId', component: DriverKycPage },
  { path: '/fraud', component: FraudAlertsPage },
  { path: '/ledger', component: LedgerPage },
  { path: '/refunds', component: RefundsQueuePage },
  { path: '/surge', component: SurgeControlsPage },
  { path: '/audit', component: AuditLogPage },
] as const

export const routeTree = rootRoute.addChildren([
  signInRoute,
  authenticatedRoute.addChildren([
    rideDetailRoute,
    ...flatRoutes.map((route) =>
      createRoute({ getParentRoute: () => authenticatedRoute, path: route.path, component: route.component }),
    ),
  ]),
])
