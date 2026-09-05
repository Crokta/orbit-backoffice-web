import { API_BASE_URL } from '../api/base-url'

/**
 * Where the session lives.
 *
 * The access token is a module-scoped variable — never in `localStorage`. A token in
 * local storage is readable by any script that ends up on the page, which includes
 * anything a supply-chain compromise in a dependency puts there.
 *
 * The refresh token and its family id are kept in `sessionStorage`: per tab, gone when
 * the tab closes, and the reason a reload does not land on the sign-in page. Identity
 * issues them in the response body and rotates them on every refresh; there is no
 * httpOnly cookie on this platform, because the same endpoint serves the mobile apps.
 * The refresh token is useless without the device fingerprint below, which is what
 * makes holding it in the tab acceptable.
 */
interface RefreshGrant {
  readonly refreshToken: string
  readonly familyId: string
}

const REFRESH_KEY = 'orbit-refresh'
const DEVICE_KEY = 'orbit-device'

let accessToken: string | null = null
let expiresAt = 0

/** In-flight refresh, so ten concurrent 401s produce one refresh rather than ten. */
let refreshInFlight: Promise<boolean> | null = null

const listeners = new Set<(signedIn: boolean) => void>()

export function getAccessToken(): string | null {
  return accessToken
}

/**
 * Identifies this browser to identity.
 *
 * A refresh token is bound to the device it was issued to; presenting it from another
 * fingerprint is treated as theft and revokes the family. A random id kept in local
 * storage is the closest thing a browser has to a device — stable across reloads,
 * different per browser profile.
 */
export function deviceFingerprint(): string {
  try {
    const existing = localStorage.getItem(DEVICE_KEY)

    if (existing !== null && existing.length > 0) {
      return existing
    }

    const created = `web-${crypto.randomUUID()}`
    localStorage.setItem(DEVICE_KEY, created)
    return created
  } catch {
    // Storage disabled: a per-load fingerprint means refresh will not work across a
    // reload, which is the honest outcome for a browser that cannot remember anything.
    return `web-${crypto.randomUUID()}`
  }
}

export function setSession(token: string, expiresInSeconds: number, refresh?: RefreshGrant): void {
  accessToken = token

  // A 30-second margin, so a token does not expire in flight between the check and the
  // server reading it. Clocks drift and networks are slow.
  expiresAt = Date.now() + (expiresInSeconds - 30) * 1000

  if (refresh !== undefined) {
    try {
      sessionStorage.setItem(REFRESH_KEY, JSON.stringify(refresh))
    } catch {
      // Private mode or storage disabled. The session lasts until the token expires.
    }
  }

  for (const listener of listeners) listener(true)
}

export function clearSession(): void {
  accessToken = null
  expiresAt = 0

  try {
    sessionStorage.removeItem(REFRESH_KEY)
  } catch {
    // Nothing stored.
  }

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

function readRefreshGrant(): RefreshGrant | null {
  try {
    const raw = sessionStorage.getItem(REFRESH_KEY)

    if (raw === null) {
      return null
    }

    const parsed = JSON.parse(raw) as Partial<RefreshGrant>

    return typeof parsed.refreshToken === 'string' && typeof parsed.familyId === 'string'
      ? { refreshToken: parsed.refreshToken, familyId: parsed.familyId }
      : null
  } catch {
    return null
  }
}

/**
 * Exchanges the refresh token for a new pair.
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

interface TokenPair {
  readonly accessToken: string
  readonly refreshToken: string
  readonly familyId: string
  readonly expiresInSeconds: number
}

async function performRefresh(): Promise<boolean> {
  const grant = readRefreshGrant()

  if (grant === null) {
    // Nothing to trade in: a fresh tab, or a session already cleared. Not a failure
    // worth a network round trip.
    clearSession()
    return false
  }

  try {
    const response = await fetch(`${API_BASE_URL}/v1/auth/refresh`, {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({ familyId: grant.familyId, refreshToken: grant.refreshToken, deviceFingerprint: deviceFingerprint() }),
    })

    if (!response.ok) {
      clearSession()
      return false
    }

    const body = (await response.json()) as TokenPair
    setSession(body.accessToken, body.expiresInSeconds, { refreshToken: body.refreshToken, familyId: body.familyId })

    return true
  } catch {
    // The network is down, not the session. The token is cleared anyway: continuing
    // with an expired one produces a stream of 401s that look like an auth bug.
    clearSession()
    return false
  }
}
