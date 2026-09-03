import { z } from 'zod'

/**
 * RFC 9457 Problem Details, as every Orbit service returns them.
 *
 * The `code` is the stable, machine-readable part — `ride.already_cancelled` — and it
 * is what the UI branches on. The `detail` is prose written for a person and may be
 * reworded at any time, so branching on it would produce a UI that breaks on a copy
 * change.
 */
export const problemSchema = z.object({
  type: z.string().optional(),
  title: z.string(),
  status: z.number(),
  detail: z.string().optional(),
  code: z.string().optional(),
  traceId: z.string().optional(),
  errors: z.record(z.array(z.string())).optional(),
})

export type Problem = z.infer<typeof problemSchema>

/** A failed request, carrying the server's own account of why. */
export class ApiError extends Error {
  readonly status: number
  readonly code: string
  readonly traceId: string | undefined
  readonly fieldErrors: Record<string, string[]> | undefined

  constructor(problem: Problem) {
    super(problem.detail ?? problem.title)
    this.name = 'ApiError'
    this.status = problem.status
    this.code = problem.code ?? 'unknown'
    this.traceId = problem.traceId
    this.fieldErrors = problem.errors
  }

  /**
   * Whether retrying could plausibly succeed.
   *
   * A 409 is not retryable: the state moved on, and repeating the same request against
   * the same stale assumption produces the same conflict. A 429 or a 503 is — the
   * request was fine and the moment was not.
   */
  get isRetryable(): boolean {
    return this.status === 429 || this.status >= 500
  }

  /** Whether the session is gone and the user must sign in again. */
  get isUnauthenticated(): boolean {
    return this.status === 401
  }
}

/** Turns a failed response into an {@link ApiError}, whatever shape the body is in. */
export async function toApiError(response: Response): Promise<ApiError> {
  try {
    const parsed = problemSchema.safeParse(await response.json())

    if (parsed.success) {
      return new ApiError(parsed.data)
    }
  } catch {
    // A gateway timeout page, an empty body, HTML from a proxy. Falling through to the
    // status line is the honest answer; inventing a code would send the UI down a
    // branch built for a different failure.
  }

  return new ApiError({ title: response.statusText || 'Request failed', status: response.status })
}
