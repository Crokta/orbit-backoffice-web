import { type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes, forwardRef, useId } from 'react'

import { cn } from './cn'

/** Label, control, hint and error, stacked the way every form in the design stacks them. */
export function Field({
  label,
  hint,
  error,
  htmlFor,
  children,
  className,
}: {
  readonly label: string
  readonly hint?: ReactNode
  readonly error?: string | undefined
  readonly htmlFor?: string
  readonly children: ReactNode
  readonly className?: string
}) {
  return (
    <div className={cn('space-y-1.5', className)}>
      <label htmlFor={htmlFor} className="block text-[13px] font-medium text-fg">
        {label}
      </label>
      {children}
      {error !== undefined ? (
        <p role="alert" className="text-[12px] text-fg-danger">{error}</p>
      ) : hint !== undefined ? (
        <p className="text-[12px] text-fg-tertiary">{hint}</p>
      ) : null}
    </div>
  )
}

const CONTROL =
  'h-10 w-full rounded-md border border-line bg-surface px-3 text-[14px] text-fg placeholder:text-fg-tertiary ' +
  'transition-colors focus:border-line-focus focus:outline-none disabled:cursor-not-allowed disabled:bg-disabled disabled:text-fg-disabled'

export const TextInput = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function TextInput(
  { className, ...rest },
  ref,
) {
  return <input ref={ref} className={cn(CONTROL, className)} {...rest} />
})

export function TextArea({ className, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn(CONTROL, 'h-auto min-h-[88px] py-2', className)} {...rest} />
}

export function Select({ className, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={cn(CONTROL, 'pr-8', className)} {...rest}>
      {children}
    </select>
  )
}

/** A text input with a leading currency symbol. */
export function PrefixedInput({
  prefix,
  className,
  ...rest
}: InputHTMLAttributes<HTMLInputElement> & { readonly prefix: string }) {
  return (
    <div className="relative">
      <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-[14px] text-fg-secondary">
        {prefix}
      </span>
      <input className={cn(CONTROL, 'pl-8', className)} {...rest} />
    </div>
  )
}

/** A checkbox with a title and a one-line explanation. */
export function Checkbox({
  checked,
  onChange,
  label,
  description,
  disabled,
}: {
  readonly checked: boolean
  readonly onChange: (checked: boolean) => void
  readonly label: string
  readonly description?: string
  readonly disabled?: boolean
}) {
  const id = useId()

  return (
    <div className="flex items-start gap-2.5">
      <input
        id={id}
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => { onChange(event.target.checked); }}
        className="mt-0.5 size-[16px] shrink-0 cursor-pointer rounded-[4px] border-line accent-[var(--bg-brand)] disabled:cursor-not-allowed"
      />
      <label htmlFor={id} className={cn('cursor-pointer select-none', disabled === true && 'cursor-not-allowed opacity-60')}>
        <span className="block text-[13px] font-medium leading-5 text-fg">{label}</span>
        {description !== undefined && <span className="block text-[12px] leading-4 text-fg-tertiary">{description}</span>}
      </label>
    </div>
  )
}

/** A full-width notice inside a page or dialog. */
export function Notice({
  tone,
  title,
  children,
  action,
  className,
}: {
  readonly tone: 'info' | 'warning' | 'danger' | 'success'
  readonly title?: string
  readonly children?: ReactNode
  readonly action?: ReactNode
  readonly className?: string
}) {
  const box = {
    info: 'border-line bg-brand-subtle text-fg-brand',
    warning: 'border-[color:var(--bg-warning)]/50 bg-warning-subtle text-fg-warning',
    danger: 'border-[color:var(--bg-danger)]/60 bg-danger-subtle text-fg-danger',
    success: 'border-[color:var(--bg-success)]/50 bg-success-subtle text-fg-success',
  }[tone]

  return (
    <div role={tone === 'danger' ? 'alert' : 'status'} className={cn('flex items-center gap-3 rounded-lg border px-4 py-3', box, className)}>
      <div className="min-w-0 flex-1">
        {title !== undefined && <p className="text-[13px] font-semibold leading-5">{title}</p>}
        {children !== undefined && <div className={cn('text-[12px] leading-[17px]', title !== undefined && 'opacity-90')}>{children}</div>}
      </div>
      {action}
    </div>
  )
}
