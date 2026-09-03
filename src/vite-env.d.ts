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
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
