/// <reference types="vite/client" />

/**
 * The environment this application reads, typed.
 *
 * Vite's own `ImportMetaEnv` has an index signature of `any`, so every `import.meta.env`
 * access is untyped by default — which means a renamed variable becomes `undefined` at
 * runtime with nothing failing at build time. Declaring the two we actually use turns
 * that into a compile error.
 */
interface ImportMetaEnv {
  /** The gateway origin. Used by the dev-server proxy, not by the browser. */
  readonly VITE_GATEWAY_URL?: string

  /** What the browser calls. Same-origin `/api` in every environment. */
  readonly VITE_API_BASE_URL?: string

  /**
   * Which platform this build talks to, shown in the sidebar.
   *
   * A label, not a switch: nothing branches on it. It exists because every destructive
   * control in this console behaves identically against staging and production, so the
   * only thing between a rehearsal and a real force-cancel is the operator knowing
   * which one is on screen.
   */
  readonly VITE_ENVIRONMENT?: string

  /** The market this console is pointed at, shown beside the environment. */
  readonly VITE_MARKET?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
