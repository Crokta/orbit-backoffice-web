/**
 * Renders an amount held in minor units.
 *
 * Minor units all the way from the ledger to this component, and the division happens
 * here — the last moment before a human reads it. Every earlier conversion to a float
 * is a rounding error waiting to be reconciled, and a ledger that disagrees with a
 * receipt by one kobo is a support ticket nobody can close.
 */
export function Money({
  minorUnits,
  currency,
  className,
}: {
  readonly minorUnits: number
  readonly currency: string
  readonly className?: string
}) {
  const formatted = new Intl.NumberFormat('en-NG', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
  }).format(minorUnits / 100)

  return (
    // Tabular figures, so a column of fares lines up. A finance screen where the digits
    // are proportionally spaced cannot be scanned, and scanning is the entire job.
    <span className={`tabular ${className ?? ''}`}>{formatted}</span>
  )
}
