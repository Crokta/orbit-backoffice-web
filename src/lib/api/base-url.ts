/**
 * Where every request goes: the YARP gateway, either as a same-origin path that a server
 * in front of the app proxies on, or as the gateway's own URL called cross-origin.
 *
 * Resolved in one place because two modules need it — {@link ./client} for everything and
 * `../auth/session` for the refresh, which cannot go through the client without a cycle.
 */
const configured = import.meta.env.VITE_API_BASE_URL?.trim() ?? '/api'

/**
 * The base URL, without a trailing slash.
 *
 * Every caller appends a path that already starts with one, so a configured value ending
 * in a slash produces `//v1/...`. That does not match any gateway route: it falls through
 * to a bare 401 with no body, which on the sign-in screen is indistinguishable from a
 * password the identity service rejected. The same trailing slash is stripped by the
 * nginx and vite proxies, so this only shows up in a deployment configured by hand.
 */
export const API_BASE_URL = configured.replace(/\/+$/, '') || '/api'
