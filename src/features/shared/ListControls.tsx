import { useState, type ReactNode } from 'react'

import { Button } from '../../components/ui/Button'
import { cn } from '../../components/ui/cn'
import { downloadFile } from '../../lib/download'
import { PAGE_SIZES, type PagedList, type PageSize } from '../../lib/paging'

const CONTROL =
  'h-9 rounded-md border border-line bg-surface px-3 text-[13px] text-fg placeholder:text-fg-tertiary focus:border-line-focus focus:outline-none'

/** The search box every list has. Debounce it with `useDebounced` before querying. */
export function SearchBox({
  value,
  onChange,
  placeholder,
  className,
}: {
  readonly value: string
  readonly onChange: (value: string) => void
  readonly placeholder: string
  readonly className?: string
}) {
  return (
    <input
      type="search"
      value={value}
      onChange={(event) => { onChange(event.target.value); }}
      placeholder={placeholder}
      aria-label={placeholder}
      className={cn(CONTROL, 'w-72', className)}
    />
  )
}

/** A labelled dropdown filter that sits beside a search box. */
export function FilterSelect<T extends string>({
  label,
  value,
  options,
  onChange,
  className,
}: {
  readonly label: string
  readonly value: T
  readonly options: readonly { readonly value: T; readonly label: string }[]
  readonly onChange: (value: T) => void
  readonly className?: string
}) {
  return (
    <select
      aria-label={label}
      value={value}
      onChange={(event) => { onChange(event.target.value as T); }}
      className={cn(CONTROL, 'pr-8', className)}
    >
      {options.map((option) => (
        <option key={option.value} value={option.value}>{option.label}</option>
      ))}
    </select>
  )
}

/** A from/to pair. Values are ISO dates (yyyy-mm-dd) or empty. */
export function DateRange({
  from,
  to,
  onChange,
}: {
  readonly from: string
  readonly to: string
  readonly onChange: (range: { readonly from: string; readonly to: string }) => void
}) {
  return (
    <div className="flex items-center gap-2 text-[12px] text-fg-tertiary">
      <label className="flex items-center gap-1.5">
        <span>From</span>
        <input type="date" aria-label="From date" value={from} max={to || undefined} onChange={(event) => { onChange({ from: event.target.value, to }); }} className={CONTROL} />
      </label>
      <label className="flex items-center gap-1.5">
        <span>To</span>
        <input type="date" aria-label="To date" value={to} min={from || undefined} onChange={(event) => { onChange({ from, to: event.target.value }); }} className={CONTROL} />
      </label>
    </div>
  )
}

/**
 * Previous / next and the page size, for a cursor-paged table.
 *
 * No "page 3 of 12": a keyset list has no cheap total, and a count that is out of date
 * the moment a row is inserted is a number nobody should trust. What it does say is where
 * you are and whether there is more.
 */
export function Pagination<T>({ list, className }: { readonly list: PagedList<T>; readonly className?: string }) {
  return (
    <div className={cn('flex flex-wrap items-center justify-between gap-3 text-[12px] text-fg-tertiary', className)}>
      <div className="flex items-center gap-2">
        <span>{list.pageNumber === 1 ? 'Newest first' : `Page ${String(list.pageNumber)}`}</span>
        <span aria-hidden="true">·</span>
        <label className="flex items-center gap-2">
          <span>Rows</span>
          <select
            aria-label="Rows per page"
            value={list.limit}
            onChange={(event) => { list.setLimit(Number(event.target.value) as PageSize); }}
            className={cn(CONTROL, 'h-8 w-[76px] px-2')}
          >
            {PAGE_SIZES.map((size) => (
              <option key={size} value={size}>{size}</option>
            ))}
          </select>
        </label>
      </div>

      <div className="flex gap-2">
        <Button variant="secondary" size="sm" disabled={!list.hasPrevious} onClick={list.previous}>
          Previous
        </Button>
        <Button variant="secondary" size="sm" disabled={!list.hasNext} onClick={list.next}>
          Next
        </Button>
      </div>
    </div>
  )
}

/**
 * Streams the current view as CSV from the server.
 *
 * The same filters as the table go up with the request, so what comes down is exactly
 * what is on screen — every page of it, not the one that happened to be loaded.
 */
export function ExportButton({
  path,
  query,
  filename,
  label = 'Download CSV',
  disabled,
}: {
  readonly path: string
  readonly query?: Record<string, string | number | boolean | undefined>
  readonly filename?: string
  readonly label?: string
  readonly disabled?: boolean
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function run() {
    setBusy(true)
    setError(null)

    try {
      await downloadFile(path, query ?? {}, filename)
    } catch (failure) {
      setError(failure instanceof Error && failure.message.length > 0 ? failure.message : 'The export could not be downloaded.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <span className="inline-flex items-center gap-2">
      {error !== null && <span role="alert" className="text-[12px] text-fg-danger">{error}</span>}
      <Button variant="secondary" size="sm" loading={busy} disabled={disabled} onClick={() => { void run() }}>
        {label}
      </Button>
    </span>
  )
}

/** The row of controls above a table: search on the left, filters, then actions. */
export function ListToolbar({ children, actions }: { readonly children: ReactNode; readonly actions?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex flex-wrap items-center gap-2">{children}</div>
      {actions !== undefined && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  )
}

/** The chip row the console uses for a one-of filter. */
export function Chips<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  readonly label: string
  readonly value: T
  readonly options: readonly { readonly value: T; readonly label: string }[]
  readonly onChange: (value: T) => void
}) {
  return (
    <div role="radiogroup" aria-label={label} className="flex flex-wrap items-center gap-1.5">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={value === option.value}
          onClick={() => { onChange(option.value); }}
          className={cn(
            'h-8 rounded-full px-3 text-[13px] font-medium transition-colors',
            value === option.value ? 'bg-brand text-fg-on-brand' : 'bg-subtle text-fg-secondary hover:bg-hover',
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}
