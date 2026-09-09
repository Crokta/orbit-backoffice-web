/**
 * The handful of formatters every list and detail page reaches for.
 *
 * Kept out of the features so that a duration reads the same on the deliveries board as
 * it does on a vehicle's shift — "1h 12m" in one place and "72 min" in another is two
 * numbers an operator has to convert before comparing.
 */

/** "42s", "4m", "1h 12m", "3d 2h" — the way time-in-state is read off a board. */
export function formatDuration(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds))

  if (total < 60) {
    return `${String(total)}s`
  }

  const minutes = Math.floor(total / 60)

  if (minutes < 60) {
    return `${String(minutes)}m`
  }

  const hours = Math.floor(minutes / 60)

  if (hours < 24) {
    const rest = minutes % 60
    return rest === 0 ? `${String(hours)}h` : `${String(hours)}h ${String(rest)}m`
  }

  const days = Math.floor(hours / 24)
  const restHours = hours % 24

  return restHours === 0 ? `${String(days)}d` : `${String(days)}d ${String(restHours)}h`
}

/** Seconds since an instant, for a "since" column the server did not pre-compute. */
export function secondsSince(iso: string, now = Date.now()): number {
  return Math.max(0, (now - new Date(iso).getTime()) / 1000)
}

/** "9 Sep 2026, 14:28". An em dash for nothing, never "Invalid Date". */
export function formatDateTime(iso: string | null | undefined): string {
  if (iso == null || iso.length === 0) {
    return '—'
  }

  const date = new Date(iso)

  if (Number.isNaN(date.getTime())) {
    return '—'
  }

  return date.toLocaleString('en-NG', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

/** "9 Sep 2026". */
export function formatDate(iso: string | null | undefined): string {
  if (iso == null || iso.length === 0) {
    return '—'
  }

  const date = new Date(iso)

  if (Number.isNaN(date.getTime())) {
    return '—'
  }

  return date.toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' })
}

/** The `yyyy-mm-dd` an `<input type="date">` wants, out of an ISO instant. */
export function toDateInputValue(iso: string | null | undefined): string {
  if (iso == null || iso.length === 0) {
    return ''
  }

  const date = new Date(iso)

  return Number.isNaN(date.getTime()) ? '' : date.toISOString().slice(0, 10)
}

/** A `yyyy-mm-dd` or `yyyy-mm-ddThh:mm` input value as an ISO instant, or undefined when blank or malformed. */
export function fromInputValue(value: string): string | undefined {
  if (value.trim().length === 0) {
    return undefined
  }

  const date = new Date(value)

  return Number.isNaN(date.getTime()) ? undefined : date.toISOString()
}

/** Naira typed by a person — "12,500" or "12500.50" — as kobo. Undefined when it is not a number. */
export function parseMoneyToMinor(value: string): number | undefined {
  const cleaned = value.replace(/[,\s₦]/g, '')

  if (cleaned.length === 0) {
    return undefined
  }

  const major = Number.parseFloat(cleaned)

  return Number.isFinite(major) && major >= 0 ? Math.round(major * 100) : undefined
}

/** A whole number typed by a person, or undefined. */
export function parseWhole(value: string): number | undefined {
  const cleaned = value.replace(/[,\s]/g, '')

  if (cleaned.length === 0) {
    return undefined
  }

  const parsed = Number.parseInt(cleaned, 10)

  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined
}
