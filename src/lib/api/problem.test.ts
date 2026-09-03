import { describe, expect, it } from 'vitest'

import { ApiError, toApiError } from './problem'

describe('ApiError', () => {
  it('branches on the stable code, not the prose', () => {
    const error = new ApiError({
      title: 'Conflict',
      status: 409,
      detail: 'This ride has already been cancelled.',
      code: 'ride.already_cancelled',
    })

    // The detail is written for a person and may be reworded at any time. Branching on
    // it would produce a UI that breaks on a copy change.
    expect(error.code).toBe('ride.already_cancelled')
    expect(error.message).toBe('This ride has already been cancelled.')
  })

  it('treats a conflict as not retryable', () => {
    // The state moved on. Repeating the same request against the same stale assumption
    // produces the same conflict, forever.
    expect(new ApiError({ title: 'Conflict', status: 409 }).isRetryable).toBe(false)
  })

  it('treats rate limiting and server faults as retryable', () => {
    expect(new ApiError({ title: 'Too many requests', status: 429 }).isRetryable).toBe(true)
    expect(new ApiError({ title: 'Unavailable', status: 503 }).isRetryable).toBe(true)
  })

  it('does not retry an authorisation failure', () => {
    // Retrying a 403 turns one refusal into four and makes an authorisation bug look
    // like a slow page.
    expect(new ApiError({ title: 'Forbidden', status: 403 }).isRetryable).toBe(false)
  })

  it('falls back to the status line when the body is not a problem document', async () => {
    const response = new Response('<html>502 Bad Gateway</html>', {
      status: 502,
      statusText: 'Bad Gateway',
    })

    const error = await toApiError(response)

    // A gateway's HTML error page is not a contract. Inventing a code here would send
    // the UI down a branch built for a different failure.
    expect(error.status).toBe(502)
    expect(error.code).toBe('unknown')
  })

  it('surfaces field errors for a validation failure', async () => {
    const response = new Response(
      JSON.stringify({
        title: 'Validation failed',
        status: 400,
        code: 'validation.failed',
        errors: { email: ['Must be a work address.'] },
      }),
      { status: 400, headers: { 'Content-Type': 'application/json' } },
    )

    const error = await toApiError(response)

    expect(error.fieldErrors?.['email']).toEqual(['Must be a work address.'])
  })
})
