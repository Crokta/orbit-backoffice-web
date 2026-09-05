// Writes dist/_redirects for a Netlify deployment.
//
// Netlify serves static files and nothing else: no vite dev server, no nginx. Two things
// that the other two deployment paths provide have to be recreated here.
//
// The first is the SPA fallback. The router owns /trips, /fleet and the rest; Netlify has
// never heard of them and answers its own 404 for a reload or a shared link. This is
// needed in every configuration below.
//
// The second is the /api proxy — but only when VITE_API_BASE_URL is a relative path. That
// is what decides the shape of this file, so it is what this script reads:
//
//   VITE_API_BASE_URL=https://api.dev.orbit.crokta.com
//       The browser calls the gateway directly. No proxy rule; the gateway must list this
//       site's origin in CORS__ALLOWEDORIGINS__n, or every call fails preflight.
//
//   VITE_API_BASE_URL=/api
//       Same-origin, proxied on to VITE_GATEWAY_URL — the arrangement vite.config.ts uses
//       in development and nginx.conf.template uses in the container.
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const baseUrl = process.env.VITE_API_BASE_URL?.trim().replace(/\/+$/, '') ?? ''

if (baseUrl === '') {
  console.error('VITE_API_BASE_URL is not set. The deployed console would have no API to talk to.')
  process.exit(1)
}

// The fallback is last in every case. Netlify takes the first rule that matches, so a /*
// to index.html above a proxy rule would swallow every API call and return the app's HTML
// where JSON was expected.
const fallback = '/*      /index.html    200'

let rules

if (/^https?:\/\//.test(baseUrl)) {
  rules = `${fallback}\n`
  console.log(`_redirects: SPA fallback only — the browser calls ${baseUrl} directly.`)
  console.log(`Check the gateway allows this site's origin in CORS__ALLOWEDORIGINS__n.`)
} else {
  const gateway = process.env.VITE_GATEWAY_URL?.trim().replace(/\/+$/, '')

  if (!gateway) {
    console.error(
      `VITE_API_BASE_URL is the relative path "${baseUrl}", which has to be proxied somewhere, ` +
        'but VITE_GATEWAY_URL is not set. Set it, or set VITE_API_BASE_URL to the gateway URL.',
    )
    process.exit(1)
  }

  // The prefix is stripped, exactly as the vite rewrite and nginx proxy_pass strip it: the
  // gateway routes /v1/** and /.well-known/** and knows nothing about /api.
  rules = `${baseUrl}/*  ${gateway}/:splat  200\n${fallback}\n`
  console.log(`_redirects: ${baseUrl}/* -> ${gateway}/:splat`)
}

const dist = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'dist')

mkdirSync(dist, { recursive: true })
writeFileSync(resolve(dist, '_redirects'), rules)
