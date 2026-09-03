import { QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider, createRouter } from '@tanstack/react-router'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import './design/theme.css'
import { createQueryClient } from './lib/query/client'
import { routeTree } from './app/routeTree'

const queryClient = createQueryClient()

const router = createRouter({
  routeTree,

  // The query client rides along in the router context, so a route loader can prefetch
  // into the same cache the components read from. Two clients would mean a loader that
  // fetches and a component that fetches again.
  context: { queryClient },

  defaultPreload: 'intent',
  defaultPreloadStaleTime: 0,
})

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}

const container = document.getElementById('root')

if (container === null) {
  throw new Error('The #root element is missing from index.html.')
}

createRoot(container).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </StrictMode>,
)
