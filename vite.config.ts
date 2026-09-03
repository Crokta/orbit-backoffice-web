import { fileURLToPath, URL } from 'node:url'

import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react()],

  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },

  server: {
    port: Number(process.env.PORT ?? 5173),

    // Everything goes through the YARP gateway — no direct service URLs anywhere in
    // the app, in development or in production. The gateway is where authentication,
    // rate limiting and header sanitisation happen, and a client that can reach a
    // service directly is a client that can skip all three.
    proxy: {
      '/api': {
        target: process.env.VITE_GATEWAY_URL ?? 'http://localhost:8080',
        changeOrigin: true,
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
