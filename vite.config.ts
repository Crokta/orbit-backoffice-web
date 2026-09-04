import { fileURLToPath, URL } from 'node:url'

import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react()],

  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },

  server: {
    port: Number(process.env.PORT ?? 5174),

    // Everything goes through the YARP gateway — no direct service URLs anywhere in
    // the app, in development or in production. The gateway is where authentication,
    // rate limiting and header sanitisation happen, and a client that can reach a
    // service directly is a client that can skip all three.
    proxy: {
      '/api': {
        target: process.env.VITE_GATEWAY_URL ?? 'http://localhost:8080',
        changeOrigin: true,

        // The prefix is stripped. The client prefixes every request with /api so that one
        // origin serves both the app and its API, but the gateway routes /v1/** and knows
        // nothing about /api — without this rewrite every call in development reached the
        // gateway as /api/v1/... , fell through every route, and came back as a bare 401
        // that looks exactly like a rejected credential. Neither console could talk to the
        // platform at all, and the symptom pointed at authentication rather than routing.
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
    },
  },

  build: {
    // Source maps in production. A minified stack trace from a support engineer's
    // browser is not a bug report, it is a riddle.
    sourcemap: true,
    target: 'es2022',
  },
})
