import { type ReactNode, useEffect, useRef } from 'react'

import { cn } from './cn'

/**
 * A modal, on the native `<dialog>` element.
 *
 * The browser supplies the overlay, focus containment, Escape to close and inert content
 * behind it — each of which a hand-rolled modal gets subtly wrong. What is left to do is
 * open it when asked and report when the user closed it.
 */
export function Dialog({
  open,
  onClose,
  title,
  subtitle,
  children,
  footer,
  size = 'md',
  tone = 'neutral',
}: {
  readonly open: boolean
  readonly onClose: () => void
  readonly title: string
  readonly subtitle?: string | undefined
  readonly children: ReactNode
  readonly footer?: ReactNode
  readonly size?: 'md' | 'lg'
  /** A red frame for the ones that charge somebody or page somebody. */
  readonly tone?: 'neutral' | 'danger'
}) {
  const ref = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const element = ref.current

    if (element === null) {
      return
    }

    if (open && !element.open) {
      element.showModal()
    } else if (!open && element.open) {
      element.close()
    }
  }, [open])

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(event) => {
        // A click on the backdrop lands on the dialog element itself; a click inside
        // lands on a child. Only the former closes it.
        if (event.target === event.currentTarget) {
          onClose()
        }
      }}
      aria-labelledby="dialog-title"
      className={cn(
        'm-auto w-[calc(100%-2rem)] rounded-xl border bg-surface p-0 text-fg shadow-xl',
        'backdrop:bg-[rgb(2_6_23/0.6)]',
        tone === 'danger' ? 'border-[color:var(--bg-danger)]' : 'border-line-subtle',
        size === 'md' ? 'max-w-[580px]' : 'max-w-[720px]',
      )}
    >
      {open && (
        <div className="p-7">
          <header className="mb-5 flex items-start justify-between gap-6">
            <div>
              <h2 id="dialog-title" className="text-[19px] font-semibold leading-[24px]">{title}</h2>
              {subtitle !== undefined && <p className="mt-1 text-[13px] text-fg-secondary">{subtitle}</p>}
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="-mr-2 -mt-2 grid size-8 place-items-center rounded-md text-fg-tertiary hover:bg-hover hover:text-fg"
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
              </svg>
            </button>
          </header>

          <div className="space-y-4">{children}</div>

          {footer !== undefined && <footer className="mt-6 flex items-center justify-end gap-3">{footer}</footer>}
        </div>
      )}
    </dialog>
  )
}
