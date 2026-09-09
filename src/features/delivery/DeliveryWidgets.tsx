import { useQuery } from '@tanstack/react-query'

import { StatusPill } from '../../components/ui/StatusPill'
import { cn } from '../../components/ui/cn'
import { formatDateTime } from '../../lib/format'
import { type DeliveryState, type PhotoRef, STATE_LABEL, type Tier, deliveryApi, deliveryKeys, isUnassigned, toStatus } from './api'

/** The state, on the shared colour ramp, with the delivery's own wording. */
export function DeliveryStatePill({ state, className }: { readonly state: DeliveryState; readonly className?: string }) {
  return <StatusPill status={toStatus(state)} label={STATE_LABEL[state]} className={className} />
}

const TIER_STYLE: Record<Tier, string> = {
  Bike: 'bg-subtle text-fg-secondary',
  Van: 'bg-brand-subtle text-fg-brand',
  Truck: 'bg-warning-subtle text-fg-warning',
}

export function TierBadge({ tier }: { readonly tier: Tier }) {
  return (
    <span className={cn('inline-flex items-center rounded-[4px] px-1.5 py-0.5 text-[11px] font-semibold leading-4', TIER_STYLE[tier])}>
      {tier}
    </span>
  )
}

/** A small red or amber tag for the things an operator scans a board for. */
export function Flag({ tone, children }: { readonly tone: 'danger' | 'warning'; readonly children: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-[4px] px-1.5 py-0.5 text-[11px] font-semibold leading-4',
        tone === 'danger' ? 'bg-danger-subtle text-fg-danger' : 'bg-warning-subtle text-fg-warning',
      )}
    >
      {children}
    </span>
  )
}

/**
 * The exception flags a row carries (REQ121).
 *
 * Three facts, each shown only when true. An empty cell means nothing is wrong, and that
 * has to be visibly different from a cell full of grey "no" badges.
 */
export function ExceptionFlags({
  row,
}: {
  readonly row: { readonly state: DeliveryState; readonly courierId: string | null; readonly hasOpenException: boolean; readonly codeLocked: boolean }
}) {
  const flags: { readonly key: string; readonly tone: 'danger' | 'warning'; readonly label: string }[] = []

  if (row.hasOpenException) {
    flags.push({ key: 'exception', tone: 'danger', label: 'Open exception' })
  }

  if (row.codeLocked) {
    flags.push({ key: 'locked', tone: 'warning', label: 'Code locked' })
  }

  if (isUnassigned(row)) {
    flags.push({ key: 'unassigned', tone: 'warning', label: 'Unassigned' })
  }

  if (flags.length === 0) {
    return <span className="text-fg-tertiary">—</span>
  }

  return (
    <span className="flex flex-wrap gap-1">
      {flags.map((flag) => (
        <Flag key={flag.key} tone={flag.tone}>{flag.label}</Flag>
      ))}
    </span>
  )
}

/** Pickup over dropoff, the way the rides list draws a route. */
export function RouteCell({ pickup, dropoff }: { readonly pickup: string; readonly dropoff: string }) {
  return (
    <>
      <span className="block">{pickup}</span>
      <span className="block text-[12px] text-fg-tertiary">to {dropoff}</span>
    </>
  )
}

/**
 * One of the custody photographs, inline.
 *
 * The bytes come through the BFF with the bearer token and are handed to the image as an
 * object URL, which is revoked the moment the image has loaded — the browser keeps the
 * decoded picture, and the blob behind the URL is released. Revoking in an effect cleanup
 * instead would break under StrictMode's rehearsal unmount, which revokes without
 * refetching. The query is not kept once the image leaves the screen, so a support agent
 * who opens forty deliveries in a shift does not carry forty photographs around.
 */
export function DeliveryPhoto({ deliveryId, photo, caption }: { readonly deliveryId: string; readonly photo: PhotoRef | null; readonly caption: string }) {
  const image = useQuery({
    queryKey: photo === null ? deliveryKeys.photo(deliveryId, 'none') : deliveryKeys.photo(deliveryId, photo.photoId),
    queryFn: () => (photo === null ? Promise.resolve('') : deliveryApi.photo(deliveryId, photo.photoId)),
    enabled: photo !== null,
    staleTime: Number.POSITIVE_INFINITY,
    gcTime: 0,
  })

  const url = image.data

  return (
    <figure className="min-w-0">
      <div className="grid aspect-[4/3] w-full place-items-center overflow-hidden rounded-lg border border-line-subtle bg-surface-sunken">
        {photo === null ? (
          <span className="text-[12px] text-fg-tertiary">No photograph</span>
        ) : image.isError ? (
          <span className="px-3 text-center text-[12px] text-fg-danger">Could not load the photograph.</span>
        ) : url === undefined || url.length === 0 ? (
          <span className="text-[12px] text-fg-tertiary">Loading…</span>
        ) : (
          <img src={url} alt={caption} className="h-full w-full object-cover" onLoad={() => { URL.revokeObjectURL(url) }} />
        )}
      </div>
      <figcaption className="mt-1.5 text-[12px] text-fg-tertiary">
        <span className="font-medium text-fg-secondary">{caption}</span>
        {photo !== null && (
          <>
            {' · '}
            {formatDateTime(photo.takenAt)}
            {photo.takenBy !== null && ` · ${photo.takenBy}`}
          </>
        )}
      </figcaption>
    </figure>
  )
}
