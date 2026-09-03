import { type ButtonHTMLAttributes, forwardRef } from 'react'

import { cn } from './cn'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'
type Size = 'sm' | 'md' | 'lg'

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  readonly variant?: Variant
  readonly size?: Size

  /**
   * Shows a spinner and blocks further clicks.
   *
   * Separate from `disabled` because they mean different things to a screen reader: a
   * disabled button is one you may not press, a busy one is a button already working.
   */
  readonly loading?: boolean
}

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-brand text-fg-on-brand hover:bg-brand-hover',
  secondary: 'bg-surface text-fg border border-line hover:bg-hover',
  ghost: 'bg-transparent text-fg hover:bg-hover',

  // Destructive actions look destructive. An operator forcing a ride closed should not
  // be one identically-styled button away from the one that reopens it.
  danger: 'bg-danger text-fg-on-brand hover:brightness-110',
}

const SIZES: Record<Size, string> = {
  // 32/40/48 from the Figma control scale. Nothing below 32px, and touch targets on
  // the mobile breakpoint get the 44px minimum from the same scale.
  sm: 'h-8 px-3 text-[13px]',
  md: 'h-10 px-4 text-[15px]',
  lg: 'h-12 px-5 text-[15px]',
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', loading = false, disabled, className, children, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      // A loading button is disabled in the DOM as well as visually. Otherwise a
      // double-click submits twice, and on a refund screen that is a real refund twice.
      disabled={disabled === true || loading}
      aria-busy={loading}
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-md font-medium transition-colors',
        'disabled:cursor-not-allowed disabled:bg-disabled disabled:text-fg-disabled',
        VARIANTS[variant],
        SIZES[size],
        className,
      )}
      {...rest}
    >
      {loading ? <Spinner /> : null}
      {children}
    </button>
  )
})

function Spinner() {
  return (
    <svg className="size-4 animate-spin" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <circle cx="8" cy="8" r="6" stroke="currentColor" strokeOpacity="0.25" strokeWidth="2" />
      <path d="M14 8a6 6 0 0 0-6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}
