import { API_BASE_URL } from './base-url'
import { ApiError, toApiError } from './problem'
import { getAccessToken, refreshAccessToken } from '../auth/session'

/**
 * The one way this application talks to Orbit.
 *
 * Every request goes through the YARP gateway. There are no service URLs in this
 * codebase, in any environment: the gateway is where authentication, rate limiting and
 * header sanitisation happen, and a client that can reach a service directly is a
 * client that can skip all three (§5.1).
 */
const BASE_URL = API_BASE_URL

interface RequestOptions extends Omit<RequestInit, 'body'> {
  /** Serialised as JSON. Pass `FormData` through `raw` instead. */
  readonly json?: unknown
  readonly raw?: BodyInit
  readonly query?: Record<string, string | number | boolean | undefined>

  /**
   * Makes a mutation safely repeatable.
   *
   * Required on anything that moves money or changes ride state. Without it, a retry
   * after a timeout the client never saw the answer to is a second refund.
   */
  readonly idempotencyKey?: string
}

/**
 * Issues one request, refreshing the token once if it has expired.
 *
 * The refresh is attempted exactly once per request. A refresh that itself fails means
 * the session is genuinely over, and retrying it in a loop turns an expired login into
 * a burst of traffic against the identity service.
 */
export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  // Resolved once, before the first attempt, so the retry below sends the SAME key. A key
  // generated per attempt would defeat the deduplication it exists for: the retry would
  // look like a new intent and be applied a second time.
  const prepared = withIdempotencyKey(options)

  const response = await send(path, prepared)

  if (response.status !== 401 || !canRefresh(path)) {
    return finish<T>(response)
  }

  const refreshed = await refreshAccessToken()

  if (!refreshed) {
    throw new ApiError({ title: 'Your session has ended', status: 401, code: 'auth.session_expired' })
  }

  return finish<T>(await send(path, prepared))
}

/**
 * Whether a 401 is worth trying to refresh away.
 *
 * Only when there was a session to begin with. A 401 from a sign-in attempt is the
 * server's answer — the password was wrong — not an expired token, and there is no
 * refresh cookie to trade in. Refreshing anyway fails, and the failure used to replace
 * the real error with "Your session has ended", so every mistyped password reported the
 * wrong reason and a locked account never said it was locked.
 *
 * The auth routes are excluded outright as well as by the token check: they are never
 * bearer-authenticated, so a 401 from one is always about the credentials in the body.
 */
function canRefresh(path: string): boolean {
  if (path.startsWith('/v1/auth/')) {
    return false
  }

  return getAccessToken() !== null
}

/** Methods the gateway requires an Idempotency-Key on. */
const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])

/**
 * Gives every mutating request a key unless the caller chose one.
 *
 * The gateway rejects a keyless POST at the edge, and it does so for every route outside
 * /v1/auth — including ones that do not look like the payments and state transitions the
 * rule was written for. Changing a password is one, which meant the mandatory
 * change-password step of a first sign-in failed with "The Idempotency-Key header is
 * required on this request" before anyone could get in.
 *
 * Making the default safe is better than remembering per call site. A caller that needs a
 * stable key across separate user actions still passes newIdempotencyKey() explicitly.
 */
function withIdempotencyKey(options: RequestOptions): RequestOptions {
  if (options.idempotencyKey !== undefined) {
    return options
  }

  if (!MUTATING_METHODS.has((options.method ?? 'GET').toUpperCase())) {
    return options
  }

  return { ...options, idempotencyKey: newIdempotencyKey() }
}

async function send(path: string, options: RequestOptions): Promise<Response> {
  const { json, raw, query, idempotencyKey, headers, ...rest } = options

  const url = new URL(`${BASE_URL}${path}`, window.location.origin)

  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined) {
      url.searchParams.set(key, String(value))
    }
  }

  const token = getAccessToken()

  // Built as a Headers object rather than spread into a literal. `HeadersInit` is a
  // union that includes an array of pairs and a Headers instance, and spreading either
  // of those into an object produces numeric indices instead of headers.
  const merged = new Headers(headers)
  merged.set('Accept', 'application/json')

  if (json !== undefined) {
    merged.set('Content-Type', 'application/json')
  }

  if (token !== null) {
    merged.set('Authorization', `Bearer ${token}`)
  }

  if (idempotencyKey !== undefined) {
    merged.set('Idempotency-Key', idempotencyKey)
  }

  return fetch(url, {
    ...rest,
    headers: merged,
    // `null`, not `undefined`. Under exactOptionalPropertyTypes an undefined body is
    // not assignable to RequestInit, and null is what fetch means by "no body" anyway.
    body: json === undefined ? (raw ?? null) : JSON.stringify(json),

    // Refresh tokens live in an httpOnly cookie, so the browser has to be allowed to
    // send it. The access token is held in memory and sent as a header — a token in
    // localStorage is readable by any script that ends up on the page.
    credentials: 'include',
  })
}

async function finish<T>(response: Response): Promise<T> {
  if (!response.ok) {
    throw await toApiError(response)
  }

  // 204 on a mutation is normal and common. Parsing an empty body throws, which would
  // turn every successful delete into an error.
  if (response.status === 204 || response.headers.get('Content-Length') === '0') {
    return undefined as T
  }

  return (await response.json()) as T
}

/** A fresh idempotency key. One per user intent, not one per attempt. */
export function newIdempotencyKey(): string {
  return crypto.randomUUID()
}

export const api = {
  get: <T>(path: string, options?: RequestOptions) => request<T>(path, { ...options, method: 'GET' }),
  post: <T>(path: string, options?: RequestOptions) => request<T>(path, { ...options, method: 'POST' }),
  put: <T>(path: string, options?: RequestOptions) => request<T>(path, { ...options, method: 'PUT' }),
  patch: <T>(path: string, options?: RequestOptions) => request<T>(path, { ...options, method: 'PATCH' }),
  delete: <T>(path: string, options?: RequestOptions) => request<T>(path, { ...options, method: 'DELETE' }),
}
