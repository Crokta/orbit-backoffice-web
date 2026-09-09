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

// jsdom draws a <dialog> but implements neither showModal nor close, and the Dialog
// component calls both. Without these every test that opens a dialog fails on a missing
// method rather than on anything about the dialog.
if (typeof HTMLDialogElement !== 'undefined' && typeof HTMLDialogElement.prototype.showModal !== 'function') {
  HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) {
    this.setAttribute('open', '')
  }

  HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement) {
    this.removeAttribute('open')
    this.dispatchEvent(new Event('close'))
  }
}

// The router restores scroll position on navigation, and jsdom's scrollTo throws "not
// implemented" — a stack trace in every page test that says nothing about the page.
Object.defineProperty(window, 'scrollTo', { writable: true, value: () => undefined })
