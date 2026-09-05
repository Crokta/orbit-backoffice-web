import { QueryClient } from '@tanstack/react-query'

import { ApiError } from '../api/problem'

/**
 * The shared query client.
 *
 * The retry policy is the interesting part. TanStack's default retries every failure
 * three times, which is right for a flaky network and actively wrong for a 403 — it
 * turns one refusal into four, and makes an authorisation bug look like a slow page.
 */
export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: (failureCount, error) => {
          if (error instanceof ApiError) {
            // 4xx means the request was wrong. Repeating it verbatim cannot fix that,
            // and for 429 it makes the rate limit worse.
            return error.isRetryable && failureCount < 2
          }

          return failureCount < 2
        },

        retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 8000),

        // Ops screens are read constantly and shown on wall displays. Thirty seconds is
        // short enough that a stale ride state is a curiosity rather than a decision,
        // and long enough that tabbing between pages does not refetch everything.
        staleTime: 30_000,
        gcTime: 5 * 60_000,

        refetchOnWindowFocus: true,
        refetchOnReconnect: true,
      },

      mutations: {
        // Mutations are never retried automatically. The ones that matter move money or
        // change ride state, and a silent retry of a request whose response was lost is
        // a second refund. Retrying is the user's decision, with the same idempotency
        // key, which is what makes it safe.
        retry: false,
      },
    },
  })
}

/**
 * Query keys, in one place.
 *
 * Invalidation is only correct if the key that reads and the key that invalidates are
 * built the same way. Two hand-written arrays that differ by one element produce a
 * screen that never refreshes, and nothing anywhere reports an error.
 */
export const queryKeys = {
  rides: {
    all: ['rides'] as const,
    list: (filters: Record<string, unknown>) => ['rides', 'list', filters] as const,
    detail: (rideId: string) => ['rides', 'detail', rideId] as const,
    audit: (rideId: string) => ['rides', 'audit', rideId] as const,
  },
  approvals: {
    all: ['approvals'] as const,
    queue: () => ['approvals', 'queue'] as const,
  },
  employees: {
    all: ['employees'] as const,
    list: (filters: Record<string, unknown>) => ['employees', 'list', filters] as const,
    detail: (employeeId: string) => ['employees', 'detail', employeeId] as const,
  },
  policies: { all: ['policies'] as const },
  costCentres: { all: ['cost-centres'] as const },
  invoices: {
    all: ['invoices'] as const,
    list: (filters: Record<string, unknown>) => ['invoices', 'list', filters] as const,
  },
  drivers: {
    all: ['drivers'] as const,
    kyc: (driverId: string) => ['drivers', 'kyc', driverId] as const,
  },
  fraud: {
    all: ['fraud'] as const,
    queue: () => ['fraud', 'queue'] as const,
  },
  ledger: { all: ['ledger'] as const },
  zones: { all: ['zones'] as const },
  commissions: { all: ['commissions'] as const },
} as const
