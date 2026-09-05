/**
 * A page whose data has no service behind it yet.
 *
 * Deliberately not a spinner and not an empty table. Both of those say "nothing here",
 * and on an operations console that is a claim about the platform — an operator who
 * reads an empty Incidents page as "no incidents" has been actively misled. This says
 * the console cannot answer, and names what is missing so the reader knows whether to
 * wait or to go and look somewhere else.
 */
export function AwaitingService({
  title,
  what,
  needs,
  insteadHref,
  insteadLabel,
}: {
  readonly title: string
  readonly what: string
  readonly needs: readonly string[]
  readonly insteadHref?: string
  readonly insteadLabel?: string
}) {
  return (
    <div className="space-y-4">
      <h1 className="text-[22px] font-semibold leading-[28px]">{title}</h1>

      <div className="max-w-2xl rounded-xl border border-line-subtle bg-surface p-6">
        <p className="text-[13px] text-fg-secondary">{what}</p>

        <p className="mt-4 text-[11px] font-semibold uppercase tracking-[0.06em] text-fg-tertiary">
          Waiting on
        </p>

        <ul className="mt-2 space-y-1.5">
          {needs.map((need) => (
            <li key={need} className="flex gap-2 text-[13px] text-fg-secondary">
              <span aria-hidden className="text-fg-tertiary">
                —
              </span>
              <span>{need}</span>
            </li>
          ))}
        </ul>

        {insteadHref !== undefined && insteadLabel !== undefined ? (
          <p className="mt-4 text-[13px]">
            <a href={insteadHref} className="text-fg-brand hover:underline">
              {insteadLabel}
            </a>
          </p>
        ) : null}
      </div>
    </div>
  )
}
