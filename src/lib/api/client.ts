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
const BASE_URL = import.meta.env['VITE_API_BASE_URL'] ?? '/api'

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
  const response = await send(path, options)

  if (response.status !== 401) {
    return finish<T>(response)
  }

  const refreshed = await refreshAccessToken()

  if (!refreshed) {
    throw new ApiError({ title: 'Your session has ended', status: 401, code: 'auth.session_expired' })
  }

  return finish<T>(await send(path, options))
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

  return fetch(url, {
    ...rest,
    headers: {
      Accept: 'application/json',
      ...(json === undefined ? {} : { 'Content-Type': 'application/json' }),
      ...(token === null ? {} : { Authorization: `Bearer ${token}` }),
      ...(idempotencyKey === undefined ? {} : { 'Idempotency-Key': idempotencyKey }),
      ...headers,
    },
    body: json === undefined ? raw : JSON.stringify(json),

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
