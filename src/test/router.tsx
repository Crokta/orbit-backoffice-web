import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Outlet, type RouteComponent, RouterProvider, createMemoryHistory, createRootRoute, createRoute, createRouter } from '@tanstack/react-router'
import { render } from '@testing-library/react'
import { vi } from 'vitest'

/**
 * Renders a page the way the application does: under the `authenticated` layout route,
 * so `useParams({ from: '/authenticated/...' })` resolves, with a query client that does
 * not retry — a test waiting on a failure should see it once.
 */
export function renderRoute(
  url: string,
  pages: readonly { readonly path: string; readonly component: RouteComponent; readonly validateSearch?: (search: Record<string, unknown>) => unknown }[],
) {
  const rootRoute = createRootRoute({ component: () => <Outlet /> })
  const authenticated = createRoute({ getParentRoute: () => rootRoute, id: 'authenticated', component: () => <Outlet /> })

  const children = pages.map((page) =>
    createRoute({
      getParentRoute: () => authenticated,
      path: page.path,
      component: page.component,
      ...(page.validateSearch === undefined ? {} : { validateSearch: page.validateSearch }),
    }),
  )

  const routeTree = rootRoute.addChildren([authenticated.addChildren(children)])
  const router = createRouter({ routeTree, history: createMemoryHistory({ initialEntries: [url] }) })
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })

  return render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
}

/** A recorded request: method, path (without the /api prefix or the query), the query, and the parsed JSON body. */
export interface SeenRequest {
  readonly method: string
  readonly path: string
  readonly query: URLSearchParams
  readonly body: unknown
  readonly headers: Headers
}

/**
 * Stubs `fetch` with a table of handlers keyed by `METHOD /path`.
 *
 * Every request is recorded, so a test can assert on what went up as well as on what came
 * down. An unhandled route answers 404 with a Problem body, which is what the gateway does.
 */
export function mockApi(handlers: Record<string, (request: SeenRequest) => unknown>): { readonly seen: SeenRequest[] } {
  const seen: SeenRequest[] = []

  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: URL | string | Request, init?: RequestInit) => {
      const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url, 'http://localhost')
      const method = (init?.method ?? 'GET').toUpperCase()
      const path = url.pathname.replace(/^\/api/, '')
      const body = typeof init?.body === 'string' ? (JSON.parse(init.body) as unknown) : undefined
      const request: SeenRequest = { method, path, query: url.searchParams, body, headers: new Headers(init?.headers) }

      seen.push(request)

      const handler = handlers[`${method} ${path}`]

      if (handler === undefined) {
        return new Response(JSON.stringify({ title: 'Not found', status: 404, code: 'test.unhandled' }), {
          status: 404,
          headers: { 'Content-Type': 'application/problem+json' },
        })
      }

      const result = await Promise.resolve(handler(request))

      if (result instanceof Response) {
        return result
      }

      return new Response(JSON.stringify(result), { status: 200, headers: { 'Content-Type': 'application/json' } })
    }),
  )

  return { seen }
}
