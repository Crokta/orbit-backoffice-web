import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useParams } from '@tanstack/react-router'
import { useState } from 'react'

import { Button } from '../../components/ui/Button'
import { Notice } from '../../components/ui/Inputs'
import { LoadError } from '../../components/ui/LoadError'
import { Money } from '../../components/ui/Money'
import { StatusPill } from '../../components/ui/StatusPill'
import { cn } from '../../components/ui/cn'
import { formatDateTime, formatDuration, secondsSince } from '../../lib/format'
import { Panel, Row } from '../corporate/CorporateWidgets'
import { DepotEventDialog, ForceCancelDialog, OpenClaimDialog, ResolveExceptionDialog } from './DeliveryActionDialogs'
import { DeliveryPhoto, DeliveryStatePill, Flag, TierBadge } from './DeliveryWidgets'
import { OverrideCodeDialog } from './OverrideCodeDialog'
import {
  CLAIM_STATUS_LABEL,
  type CodeStatus,
  type DeliveryException,
  type DeliverySettlement,
  HANDLING_LABEL,
  REPORTED_KIND_LABEL,
  STATE_LABEL,
  claimStatusTone,
  deliveryApi,
  deliveryKeys,
  describeFailure,
  isUnassigned,
} from './api'

/**
 * The full custody record of one delivery (REQ122), and everything support can do to it.
 *
 * Assembled by the admin BFF from the lifecycle, user and payment services in one call,
 * and it renders whatever arrived. A page that fails wholesale because payments is slow is
 * unavailable exactly when a sender is on the phone asking where their parcel is.
 */
export function DeliveryDetailPage() {
  const { deliveryId } = useParams({ from: '/authenticated/delivery/$deliveryId' })
  const queryClient = useQueryClient()

  const overview = useQuery({ queryKey: deliveryKeys.detail(deliveryId), queryFn: () => deliveryApi.get(deliveryId) })

  const claims = useQuery({
    queryKey: [...deliveryKeys.claims(), deliveryId],
    queryFn: () => deliveryApi.claims({ status: undefined, deliveryId, cursor: undefined, limit: 25 }),
  })

  const [resolving, setResolving] = useState<DeliveryException | null>(null)

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: deliveryKeys.all })
  }

  const retry = useMutation({ mutationFn: () => deliveryApi.retryDispatch(deliveryId), onSuccess: refresh })

  if (overview.isError) {
    return <LoadError error={overview.error} what="this delivery" onRetry={() => { void overview.refetch() }} />
  }

  if (overview.isPending) {
    return <p className="text-[13px] text-fg-tertiary">Loading delivery…</p>
  }

  const { delivery: d, courier, settlement, unavailableSections } = overview.data
  const unassigned = isUnassigned(d)
  const openExceptions = d.exceptions.filter((exception) => exception.resolvedAt === null)

  return (
    <div className="max-w-6xl space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-[12px]"><Link to="/deliveries" className="text-fg-brand hover:underline">Deliveries</Link></p>
          <h1 className="tabular text-[22px] font-semibold leading-[28px]">{d.reference}</h1>
          <p className="mt-1 flex flex-wrap items-center gap-2 text-[13px] text-fg-secondary">
            <DeliveryStatePill state={d.state} />
            <TierBadge tier={d.tier} />
            <span className="tabular" title={d.deliveryId}>{d.deliveryId}</span>
            <span>·</span>
            <span>booked {formatDateTime(d.bookedAt)}</span>
            {d.pickupCodeStatus.locked && <Flag tone="warning">Pickup code locked</Flag>}
            {d.deliveryCodeStatus.locked && <Flag tone="warning">Delivery code locked</Flag>}
            {openExceptions.length > 0 && <Flag tone="danger">{`${String(openExceptions.length)} open ${openExceptions.length === 1 ? 'exception' : 'exceptions'}`}</Flag>}
            {unassigned && <Flag tone="warning">Unassigned</Flag>}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <OverrideCodeDialog deliveryId={d.deliveryId} reference={d.reference} pickup={d.pickupCodeStatus} delivery={d.deliveryCodeStatus} onDone={refresh} />
          {unassigned && (
            <Button variant="secondary" size="sm" loading={retry.isPending} onClick={() => { retry.mutate() }}>
              Retry dispatch
            </Button>
          )}
          <DepotEventDialog deliveryId={d.deliveryId} reference={d.reference} state={d.state} currentDepotId={d.depotId} onDone={refresh} />
          <OpenClaimDialog deliveryId={d.deliveryId} reference={d.reference} declaredValueMinor={d.item?.declaredValueMinor ?? null} currency={d.currency} onDone={refresh} />
          <ForceCancelDialog deliveryId={d.deliveryId} reference={d.reference} state={d.state} fareMinor={d.finalFareMinor ?? d.quotedFareMinor} currency={d.currency} onDone={refresh} />
        </div>
      </header>

      {retry.isError && <Notice tone="danger">{describeFailure(retry.error, 'Dispatch could not be retried.')}</Notice>}

      {unavailableSections.length > 0 && (
        <Notice tone="warning">Could not load: {unavailableSections.join(', ')}. Everything else here is current.</Notice>
      )}

      {unassigned && (
        <Notice tone="warning" title="Nobody has accepted this delivery">
          Dispatch offered it three times without a taker. The sender has been told and can cancel for a full refund; retrying dispatch offers it again (REQ043).
        </Notice>
      )}

      {d.state === 'Cancelled' && (
        <Notice tone="info" title={`Cancelled${d.cancelledBy === null ? '' : ` by ${d.cancelledBy}`}`}>
          {d.cancellationReason ?? 'No reason recorded.'} · {formatDateTime(d.closedAt)}
        </Notice>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <Panel title="Sender">
          <dl>
            <Row label="Name" value={d.senderName} />
            <Row label="Phone" value={d.senderPhone} mono />
            <Row label="Email" value={d.senderEmail ?? '—'} />
            <Row label="Account" value={d.senderId ?? 'Guest (web)'} mono />
            <Row label="Pickup" value={d.pickupLabel} />
          </dl>
        </Panel>

        <Panel title="Recipient">
          <dl>
            <Row label="Name" value={d.recipientName} />
            <Row label="Phone" value={d.recipientPhone} mono />
            <Row label="Dropoff" value={d.dropoffLabel} />
            <Row label="Leave at door" value={d.leaveAtDoor ? 'Yes — delivery code waived, photo mandatory' : 'No'} tone={d.leaveAtDoor ? 'warning' : 'neutral'} />
          </dl>
        </Panel>

        <Panel title="Courier and vehicle">
          {courier === null && d.courierId === null ? (
            <p className="text-[13px] text-fg-tertiary">No courier has been assigned.</p>
          ) : (
            <dl>
              <Row label="Courier" value={courier?.displayName ?? d.courierId ?? '—'} />
              <Row label="Phone" value={courier?.phoneMasked ?? '—'} mono />
              <Row label="Courier id" value={d.courierId ?? '—'} mono />
              <Row label="Vehicle" value={d.vehiclePlate ?? '—'} mono />
              <Row
                label="Vehicle id"
                value={
                  d.vehicleId === null ? '—' : (
                    <Link to="/fleet/vehicle/$vehicleId" params={{ vehicleId: d.vehicleId }} className="text-fg-brand hover:underline">{d.vehicleId}</Link>
                  )
                }
                mono
              />
              <Row label="Assigned" value={formatDateTime(d.assignedAt)} />
            </dl>
          )}
        </Panel>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Codes" subtitle="Three wrong attempts lock a code. Support overrides after verifying by other means (REQ074, REQ126).">
          <div className="grid gap-4 sm:grid-cols-2">
            <CodeCard label="Pickup code" code={d.pickupCode} status={d.pickupCodeStatus} attemptsRecorded={d.pickupAttempts} />
            <CodeCard label="Delivery code" code={null} status={d.deliveryCodeStatus} attemptsRecorded={d.deliveryAttempts} />
          </div>
        </Panel>

        <Panel title="Photographs" subtitle="Taken in the courier app at each verification (REQ075).">
          <div className="grid gap-4 sm:grid-cols-2">
            <DeliveryPhoto deliveryId={d.deliveryId} photo={d.pickupPhoto} caption="At pickup" />
            <DeliveryPhoto deliveryId={d.deliveryId} photo={d.deliveryPhoto} caption="At delivery" />
          </div>
        </Panel>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Panel title="Declared item">
          {d.item === null ? (
            <p className="text-[13px] text-fg-tertiary">No declaration on record.</p>
          ) : (
            <dl>
              <Row label="Category" value={d.item.category} />
              <Row label="Weight" value={`${String(d.item.weightKg)} kg`} mono />
              <Row label="Dimensions" value={`${String(d.item.lengthCm)} × ${String(d.item.widthCm)} × ${String(d.item.heightCm)} cm`} mono />
              <Row label="Declared value" value={<Money minorUnits={d.item.declaredValueMinor} currency={d.currency} />} />
              <Row label="Description" value={d.item.description ?? '—'} />
            </dl>
          )}
          <h3 className="mt-4 text-[11px] font-semibold uppercase tracking-wide text-fg-tertiary">Handling</h3>
          {d.handling.length === 0 ? (
            <p className="mt-1 text-[13px] text-fg-tertiary">None declared.</p>
          ) : (
            <ul className="mt-1 flex flex-wrap gap-1.5">
              {d.handling.map((handling) => (
                <li key={handling} className="rounded-[4px] bg-subtle px-1.5 py-0.5 text-[11px] font-semibold text-fg-secondary">
                  {HANDLING_LABEL[handling] ?? handling}
                </li>
              ))}
            </ul>
          )}
          {d.notes !== null && d.notes.length > 0 && <p className="mt-3 rounded-lg bg-subtle px-3 py-2 text-[13px] text-fg-secondary">“{d.notes}”</p>}
        </Panel>

        <Panel title="Price">
          <dl>
            <Row label="Quoted" value={<Money minorUnits={d.quotedFareMinor} currency={d.currency} />} />
            <Row label="Final" value={d.finalFareMinor === null ? <span className="text-fg-tertiary">not yet finalised</span> : <Money minorUnits={d.finalFareMinor} currency={d.currency} />} />
            {d.breakdown !== null && (
              <>
                <Row label="Base fare" value={<Money minorUnits={d.breakdown.baseFareMinor} currency={d.breakdown.currency} />} />
                <Row label="Distance" value={<Money minorUnits={d.breakdown.distanceChargeMinor} currency={d.breakdown.currency} />} />
                <Row label="Handling" value={<Money minorUnits={d.breakdown.handlingMinor} currency={d.breakdown.currency} />} />
                <Row label="Waiting" value={<Money minorUnits={d.breakdown.waitingMinor} currency={d.breakdown.currency} />} />
                <Row label="Return leg" value={<Money minorUnits={d.breakdown.returnLegMinor} currency={d.breakdown.currency} />} />
                <Row label="Cancellation fee" value={<Money minorUnits={d.breakdown.cancellationFeeMinor} currency={d.breakdown.currency} />} />
                <Row label="Total" value={<Money minorUnits={d.breakdown.totalMinor} currency={d.breakdown.currency} />} tone="brand" />
                {d.breakdown.pricingRuleVersion !== null && <Row label="Pricing rule" value={d.breakdown.pricingRuleVersion} mono />}
              </>
            )}
            <Row label="Distance (est.)" value={`${(d.estimatedDistanceM / 1000).toFixed(1)} km · ${formatDuration(d.estimatedDurationS)}`} mono />
            <Row label="Payment ref" value={d.paymentReference ?? '—'} mono />
          </dl>
        </Panel>

        <SettlementPanel settlement={settlement} unavailable={unavailableSections.includes('settlement')} />
      </div>

      <Panel
        title="Exceptions"
        subtitle="What the courier reported, and how it was resolved."
        action={openExceptions.length > 0 ? <Flag tone="danger">{`${String(openExceptions.length)} open`}</Flag> : undefined}
      >
        {d.exceptions.length === 0 ? (
          <p className="text-[13px] text-fg-tertiary">None reported.</p>
        ) : (
          <ul className="divide-y divide-line-subtle">
            {d.exceptions.map((exception) => (
              <li key={exception.exceptionId} className="flex flex-wrap items-start justify-between gap-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="text-[13px]">
                    <span className="font-medium">{REPORTED_KIND_LABEL[exception.kind] ?? exception.kind}</span>
                    <span className="text-fg-tertiary"> · {formatDateTime(exception.reportedAt)}</span>
                    {exception.reportedBy !== null && <span className="tabular text-fg-tertiary"> · {exception.reportedBy}</span>}
                  </p>
                  {exception.note !== null && exception.note.length > 0 && <p className="mt-0.5 text-[13px] text-fg-secondary">{exception.note}</p>}
                  {exception.resolvedAt === null ? (
                    <p className="mt-1 text-[12px] font-medium text-fg-danger">Open · waiting {formatDuration(secondsSince(exception.reportedAt))}</p>
                  ) : (
                    <p className="mt-1 text-[12px] text-fg-success">
                      Resolved{exception.resolution === null ? '' : ` — ${exception.resolution}`}
                      {exception.resolvedBy === null ? '' : ` by ${exception.resolvedBy}`} · {formatDateTime(exception.resolvedAt)}
                    </p>
                  )}
                </div>

                <div className="flex items-start gap-3">
                  {exception.photoId !== null && (
                    <div className="w-28">
                      <DeliveryPhoto
                        deliveryId={d.deliveryId}
                        photo={{ photoId: exception.photoId, takenAt: exception.reportedAt, takenBy: exception.reportedBy, kind: 'exception' }}
                        caption="Reported"
                      />
                    </div>
                  )}
                  {exception.resolvedAt === null && (
                    <Button variant="secondary" size="sm" onClick={() => { setResolving(exception) }}>Resolve…</Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Panel
        title="Claims"
        subtitle="Loss or damage recorded against this delivery (REQ127)."
        action={<Link to="/deliveries/claims" className="text-[13px] font-medium text-fg-brand hover:underline">All claims →</Link>}
      >
        {claims.isError ? (
          <p className="text-[13px] text-fg-danger">The claims could not be loaded.</p>
        ) : claims.isPending ? (
          <p className="text-[13px] text-fg-tertiary">Loading…</p>
        ) : claims.data.items.length === 0 ? (
          <p className="text-[13px] text-fg-tertiary">No claim has been opened.</p>
        ) : (
          <ul className="divide-y divide-line-subtle">
            {claims.data.items.map((claim) => (
              <li key={claim.claimId} className="flex flex-wrap items-center justify-between gap-3 py-2.5 text-[13px]">
                <div className="min-w-0">
                  <p>
                    <span className="font-medium capitalize">{claim.kind}</span>
                    <span className="tabular text-fg-tertiary"> · {claim.claimId}</span>
                    {claim.insurerReference !== null && <span className="tabular text-fg-tertiary"> · insurer {claim.insurerReference}</span>}
                  </p>
                  <p className="truncate text-fg-secondary">{claim.description}</p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="tabular">
                    <Money minorUnits={claim.claimedAmountMinor} currency={claim.currency} />
                    {claim.recoveredAmountMinor !== null && (
                      <span className="text-fg-success"> · <Money minorUnits={claim.recoveredAmountMinor} currency={claim.currency} /> recovered</span>
                    )}
                  </span>
                  <StatusPill status={claimStatusTone(claim.status)} label={CLAIM_STATUS_LABEL[claim.status]} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Panel title="Custody record" subtitle="Every transition, with its time, who caused it and the vehicle it was on (REQ021).">
        {d.timeline.length === 0 ? (
          <p className="text-[13px] text-fg-tertiary">No events recorded.</p>
        ) : (
          <ol className="space-y-3">
            {d.timeline.map((entry) => (
              <li key={entry.eventSeq} className="flex gap-3 border-l-2 border-line pl-3">
                <div className="min-w-0 flex-1">
                  <p className="text-[13px]">
                    <span className="font-medium">{entry.eventType}</span>
                    <span className="text-fg-tertiary"> → {STATE_LABEL[entry.state]}</span>
                  </p>
                  {entry.detail !== null && entry.detail.length > 0 && <p className="text-[13px] text-fg-secondary">{entry.detail}</p>}
                  <p className="tabular text-[11px] text-fg-tertiary">
                    {formatDateTime(entry.occurredAt)}
                    {' · '}
                    {entry.actorId === null ? 'system' : `${entry.actorRole ?? 'actor'} ${entry.actorId}`}
                    {entry.vehicleId !== null && ` · vehicle ${entry.vehicleId}`}
                    {' · #'}{String(entry.eventSeq)}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        )}
      </Panel>

      <ResolveExceptionDialog deliveryId={d.deliveryId} exception={resolving} onClose={() => { setResolving(null) }} onDone={refresh} />
    </div>
  )
}

/** One code: its verification, its attempts, whether it is locked, and who overrode it. */
function CodeCard({
  label,
  code,
  status,
  attemptsRecorded,
}: {
  readonly label: string
  readonly code: string | null
  readonly status: CodeStatus
  readonly attemptsRecorded: number
}) {
  const tone = status.locked ? 'danger' : status.verified ? 'success' : 'neutral'

  return (
    <div className={cn('rounded-lg border p-3', tone === 'danger' ? 'border-[color:var(--bg-danger)]/50 bg-danger-subtle/40' : 'border-line-subtle')}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-[13px] font-semibold">{label}</p>
        {status.locked ? (
          <Flag tone="danger">Locked</Flag>
        ) : status.waived ? (
          <span className="text-[11px] font-semibold text-fg-tertiary">Waived</span>
        ) : status.verified ? (
          <span className="text-[11px] font-semibold text-fg-success">Verified</span>
        ) : (
          <span className="text-[11px] font-semibold text-fg-warning">Not yet verified</span>
        )}
      </div>

      {code !== null && <p className="tabular mt-1 text-[20px] font-semibold tracking-[0.2em]">{code}</p>}

      <dl className="mt-2 text-[12px]">
        <div className="flex justify-between py-0.5"><dt className="text-fg-secondary">Wrong attempts</dt><dd className={cn('tabular', status.attempts >= 3 && 'text-fg-danger')}>{`${String(status.attempts)} of 3`}</dd></div>
        <div className="flex justify-between py-0.5"><dt className="text-fg-secondary">Leg attempts</dt><dd className="tabular">{String(attemptsRecorded)}</dd></div>
        {status.sentAt !== null && <div className="flex justify-between py-0.5"><dt className="text-fg-secondary">Sent</dt><dd className="tabular">{formatDateTime(status.sentAt)}</dd></div>}
        {status.verifiedAt !== null && <div className="flex justify-between py-0.5"><dt className="text-fg-secondary">Verified at</dt><dd className="tabular">{formatDateTime(status.verifiedAt)}</dd></div>}
        {status.overriddenBy !== null && (
          <div className="mt-1 rounded bg-warning-subtle px-2 py-1 text-fg-warning">
            Overridden by {status.overriddenBy}{status.overrideReason === null ? '' : ` — ${status.overrideReason}`}
          </div>
        )}
      </dl>
    </div>
  )
}

/** What the money did (REQ130–133), from the payment service. */
function SettlementPanel({ settlement, unavailable }: { readonly settlement: DeliverySettlement | null; readonly unavailable: boolean }) {
  return (
    <Panel title="Settlement">
      {settlement === null ? (
        <p className="text-[13px] text-fg-tertiary">{unavailable ? 'The payment service did not answer.' : 'Nothing has settled yet.'}</p>
      ) : (
        <>
          <dl>
            <Row label="Status" value={settlement.status} />
            <Row label="Paid by sender" value={<Money minorUnits={settlement.paidMinor} currency={settlement.currency} />} />
            <Row label="Courier net" value={<Money minorUnits={settlement.courierNetMinor} currency={settlement.currency} />} />
            <Row label="Commission" value={<Money minorUnits={settlement.commissionMinor} currency={settlement.currency} />} />
            <Row label="Refunded" value={<Money minorUnits={settlement.refundedMinor} currency={settlement.currency} />} tone={settlement.refundedMinor > 0 ? 'warning' : 'neutral'} />
            <Row label="Payment ref" value={settlement.paymentReference ?? '—'} mono />
            <Row label="Settled" value={formatDateTime(settlement.settledAt)} />
          </dl>
          {settlement.manualRefundPending && (
            <Notice tone="warning" title="Manual refund pending" className="mt-3">
              The ledger owes the sender a refund no automated flow will make. It is waiting in the refunds queue for a person.
            </Notice>
          )}
        </>
      )}
    </Panel>
  )
}
