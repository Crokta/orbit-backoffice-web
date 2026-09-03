import '@testing-library/jest-dom/vitest'

// jsdom has no matchMedia, and the theme bootstrap reads it. Without this every test
// that renders the shell fails on a missing global rather than on anything real.
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    dispatchEvent: () => false,
  }),
})
