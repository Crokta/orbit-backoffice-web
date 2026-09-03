import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useParams } from '@tanstack/react-router'
import { useState } from 'react'

import { Button } from '../../components/ui/Button'
import { Money } from '../../components/ui/Money'
import { api, newIdempotencyKey } from '../../lib/api/client'
import { ApiError } from '../../lib/api/problem'
import { queryKeys } from '../../lib/query/client'

interface RideOverview {
  readonly rideId: string
  readonly ride: RideSummary | null
  readonly rider: PersonSummary | null
  readonly driver: (PersonSummary & { plate: string | null }) | null
  readonly payment: PaymentSummary | null
  readonly trace: TraceSummary | null

  /** Sections that could not be loaded. Named, so nobody mistakes them for absent. */
  readonly unavailableSections: readonly string[]
}

interface RideSummary {
  readonly state: string
  readonly riderId: string
  readonly driverId: string | null
  readonly requestedAt: string
  readonly completedAt: string | null
  readonly quotedFareMinor: number
  readonly currency: string
}

interface PersonSummary {
  readonly displayName: string
  readonly phone: string
  readonly rating: number
}

interface PaymentSummary {
  readonly status: string
  readonly chargedMinor: number
  readonly currency: string
  readonly inArrears: boolean
}

interface TraceSummary {
  readonly matchedDistanceMetres: number
  readonly rawDistanceMetres: number
  readonly matchConfidence: number
}

interface AuditEntry {
  readonly id: string
  readonly actorId: string
  readonly action: string
  readonly reason: string
  readonly succeeded: boolean
  readonly occurredAt: string
}

/**
 * The one screen a support escalation lives on.
 *
 * Assembled by the admin BFF from five services in one call, and it renders whatever
 * arrived. A page that fails wholesale because payments is slow is unavailable exactly
 * when a rider is on the phone asking about their fare.
 */
export function RideDetailPage() {
  const { rideId } = useParams({ from: '/authenticated/ride/$rideId' })
  const queryClient = useQueryClient()

  const overview = useQuery({
    queryKey: queryKeys.rides.detail(rideId),
    queryFn: () => api.get<RideOverview>(`/v1/admin/rides/${rideId}`),
  })

  const audit = useQuery({
    queryKey: queryKeys.rides.audit(rideId),
    queryFn: () => api.get<readonly AuditEntry[]>(`/v1/admin/rides/${rideId}/audit`),
  })

  if (overview.isPending) {
    return <p className="text-[13px] text-fg-secondary">Loading ride…</p>
  }

  if (overview.isError) {
    return (
      <p role="alert" className="rounded-md bg-danger-subtle px-4 py-3 text-[13px] text-fg-danger">
        This ride could not be loaded.
      </p>
    )
  }

  const data = overview.data

  return (
    <div className="max-w-5xl space-y-5">
      <header>
        <p className="tabular text-[13px] text-fg-tertiary">{data.rideId}</p>
        <h1 className="text-[28px] font-semibold leading-[34px]">
          {data.ride?.state ?? 'Unknown state'}
        </h1>
      </header>

      {data.unavailableSections.length > 0 ? (
        <p role="status" className="rounded-md bg-warning-subtle px-4 py-3 text-[13px] text-fg-warning">
          Could not load: {data.unavailableSections.join(', ')}. Everything else here is current.
        </p>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2">
        <Panel title="Rider">
          {data.rider === null ? (
            <Missing />
          ) : (
            <>
              <Row label="Name" value={data.rider.displayName} />
              {/* Masked by default. A support agent can identify somebody without being
                  handed their phone number, and unmasking is a separate audited read
                  behind the PII entitlement (§18.2). */}
              <Row label="Phone" value={data.rider.phone} />
              <Row label="Rating" value={data.rider.rating.toFixed(2)} />
            </>
          )}
        </Panel>

        <Panel title="Driver">
          {data.driver === null ? (
            <Missing message="No driver was matched." />
          ) : (
            <>
              <Row label="Name" value={data.driver.displayName} />
              <Row label="Phone" value={data.driver.phone} />
              <Row label="Vehicle" value={data.driver.plate ?? '—'} />
            </>
          )}
        </Panel>

        <Panel title="Payment">
          {data.payment === null ? (
            <Missing message="No payment yet." />
          ) : (
            <>
              <Row label="Status" value={data.payment.status} />
              <Row
                label="Charged"
                value={<Money minorUnits={data.payment.chargedMinor} currency={data.payment.currency} />}
              />
              {data.payment.inArrears ? (
                // Arrears is a normal, expected state, not an error: the rider
                // travelled and the money did not follow. Payment failure never blocks
                // the physical service (§12.1).
                <p className="mt-2 rounded bg-warning-subtle px-2 py-1 text-[13px] text-fg-warning">
                  In arrears. The ride completed; the debt is recorded.
                </p>
              ) : null}
            </>
          )}
        </Panel>

        <Panel title="Distance">
          {data.trace === null ? (
            <Missing message="No trace uploaded." />
          ) : (
            <>
              <Row label="Billable" value={`${(data.trace.matchedDistanceMetres / 1000).toFixed(2)} km`} />
              <Row label="Raw GPS" value={`${(data.trace.rawDistanceMetres / 1000).toFixed(2)} km`} />
              <Row label="Match confidence" value={data.trace.matchConfidence.toFixed(2)} />

              {data.trace.matchConfidence === 0 ? (
                <p className="mt-2 rounded bg-warning-subtle px-2 py-1 text-[13px] text-fg-warning">
                  Unmatched. The raw distance was billed; treat it with caution in a dispute.
                </p>
              ) : null}
            </>
          )}
        </Panel>
      </div>

      <ForceCancelPanel
        rideId={rideId}
        state={data.ride?.state ?? ''}
        onDone={() => {
          void queryClient.invalidateQueries({ queryKey: queryKeys.rides.detail(rideId) })
          void queryClient.invalidateQueries({ queryKey: queryKeys.rides.audit(rideId) })
        }}
      />

      <Panel title="What has been done to this ride">
        {audit.data?.length === 0 ? (
          <p className="text-[13px] text-fg-tertiary">Nothing. No operator has touched it.</p>
        ) : (
          <ul className="space-y-2">
            {audit.data?.map((entry) => (
              <li key={entry.id} className="border-l-2 border-line pl-3">
                <p className="text-[13px]">
                  <span className="font-medium">{entry.actorId}</span> — {entry.action}
                  {entry.succeeded ? null : <span className="text-fg-danger"> (failed)</span>}
                </p>
                <p className="text-[13px] text-fg-secondary">{entry.reason}</p>
                <p className="text-[11px] text-fg-tertiary">
                  {new Date(entry.occurredAt).toLocaleString('en-NG')}
                </p>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  )
}

/**
 * The override, and the reason it demands.
 *
 * Ten characters minimum, matched to what the BFF enforces. Failing here rather than at
 * the server is a courtesy, not the control — the control is in the aggregate, and a
 * client that skips this check still cannot get past it.
 */
function ForceCancelPanel({
  rideId,
  state,
  onDone,
}: {
  readonly rideId: string
  readonly state: string
  readonly onDone: () => void
}) {
  const [reason, setReason] = useState('')

  const cancel = useMutation({
    mutationFn: () =>
      api.post(`/v1/admin/rides/${rideId}/force-cancel`, {
        json: { reason },
        idempotencyKey: newIdempotencyKey(),
      }),
    onSuccess: () => {
      setReason('')
      onDone()
    },
  })

  // Terminal rides have nothing left to override, so the control is not rendered at
  // all rather than rendered and rejected.
  if (state === 'Completed' || state === 'Cancelled' || state === 'Expired') {
    return null
  }

  return (
    <section className="rounded-lg border border-line-subtle bg-surface p-4">
      <h2 className="text-[15px] font-semibold">Force cancel</h2>
      <p className="mt-1 text-[13px] text-fg-secondary">
        For a ride the state machine has got stuck on. It goes through the ordinary cancellation
        path, so the rider and driver are notified as usual.
      </p>

      <label htmlFor="reason" className="mt-3 block text-[13px] font-medium text-fg-secondary">
        Why (recorded permanently, shown in the audit log)
      </label>
      <textarea
        id="reason"
        rows={2}
        value={reason}
        onChange={(event) => { setReason(event.target.value); }}
        className="mt-1 w-full rounded-md border border-line bg-surface px-3 py-2 text-[13px]"
        placeholder="Driver's phone died mid-trip; rider confirmed they arrived."
      />

      <div className="mt-3 flex items-center justify-between">
        <p className="text-[11px] text-fg-tertiary">
          {reason.trim().length < 10 ? `${String(10 - reason.trim().length)} more characters needed` : ' '}
        </p>

        <Button
          variant="danger"
          size="sm"
          disabled={reason.trim().length < 10}
          loading={cancel.isPending}
          onClick={() => {
            cancel.mutate()
          }}
        >
          Force cancel
        </Button>
      </div>

      {cancel.error !== null ? (
        <p role="alert" className="mt-2 rounded bg-danger-subtle px-3 py-2 text-[13px] text-fg-danger">
          {cancel.error instanceof ApiError && cancel.error.status === 409
            ? 'The ride changed while you were typing. Reload and check its current state.'
            : 'The cancellation was refused. Nothing has changed.'}
        </p>
      ) : null}
    </section>
  )
}

function Panel({ title, children }: { readonly title: string; readonly children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-line-subtle bg-surface p-4">
      <h2 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-fg-tertiary">{title}</h2>
      {children}
    </section>
  )
}

function Row({ label, value }: { readonly label: string; readonly value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4 py-1 text-[13px]">
      <span className="text-fg-secondary">{label}</span>
      <span className="text-right">{value}</span>
    </div>
  )
}

function Missing({ message = 'Could not be loaded.' }: { readonly message?: string }) {
  return <p className="text-[13px] text-fg-tertiary">{message}</p>
}
