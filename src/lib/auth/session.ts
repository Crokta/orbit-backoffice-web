/**
 * Where the access token lives.
 *
 * In memory, in a module-scoped variable — never in `localStorage`. A token in local
 * storage is readable by any script that ends up on the page, which includes anything
 * a supply-chain compromise in a dependency puts there. Losing the token on a page
 * reload is a real cost, and the refresh cookie is what pays it.
 *
 * The refresh token is an httpOnly cookie the browser sends and no script can read.
 */
let accessToken: string | null = null
let expiresAt = 0

/** In-flight refresh, so ten concurrent 401s produce one refresh rather than ten. */
let refreshInFlight: Promise<boolean> | null = null

const listeners = new Set<(signedIn: boolean) => void>()

export function getAccessToken(): string | null {
  return accessToken
}

export function setSession(token: string, expiresInSeconds: number): void {
  accessToken = token

  // A 30-second margin, so a token does not expire in flight between the check and the
  // server reading it. Clocks drift and networks are slow.
  expiresAt = Date.now() + (expiresInSeconds - 30) * 1000

  for (const listener of listeners) listener(true)
}

export function clearSession(): void {
  accessToken = null
  expiresAt = 0

  for (const listener of listeners) listener(false)
}

export function isSessionValid(): boolean {
  return accessToken !== null && Date.now() < expiresAt
}

/** Subscribes to sign-in and sign-out. Returns the unsubscribe function. */
export function onSessionChange(listener: (signedIn: boolean) => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/**
 * Exchanges the refresh cookie for a new access token.
 *
 * Concurrent callers share one request. Ten queries failing with 401 at the same moment
 * is the normal case after a token expires, and ten refreshes would rotate the token
 * family ten times — which the identity service correctly treats as reuse and responds
 * to by revoking the whole family (§11.1).
 */
export function refreshAccessToken(): Promise<boolean> {
  refreshInFlight ??= performRefresh().finally(() => {
    refreshInFlight = null
  })

  return refreshInFlight
}

async function performRefresh(): Promise<boolean> {
  try {
    const response = await fetch(`${import.meta.env['VITE_API_BASE_URL'] ?? '/api'}/v1/auth/refresh`, {
      method: 'POST',
      credentials: 'include',
      headers: { Accept: 'application/json' },
    })

    if (!response.ok) {
      clearSession()
      return false
    }

    const body = (await response.json()) as { accessToken: string; expiresIn: number }
    setSession(body.accessToken, body.expiresIn)

    return true
  } catch {
    // The network is down, not the session. The token is cleared anyway: continuing
    // with an expired one produces a stream of 401s that look like an auth bug.
    clearSession()
    return false
  }
}
