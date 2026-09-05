import { useMutation } from '@tanstack/react-query'
import { useState } from 'react'

import { Button } from '../../components/ui/Button'
import { Dialog } from '../../components/ui/Dialog'
import { Checkbox, Field, Notice, TextArea } from '../../components/ui/Inputs'
import { Money } from '../../components/ui/Money'
import { cn } from '../../components/ui/cn'
import { api, newIdempotencyKey } from '../../lib/api/client'

const REASONS = [
  { code: 'app_failed_to_close', label: 'Trip completed, app failed to close it', hint: 'GPS confirms arrival at the destination' },
  { code: 'ended_early_with_consent', label: 'Driver ended trip early with rider consent', hint: 'Rider agreed to be dropped short' },
  { code: 'rider_abandoned', label: 'Rider abandoned the trip', hint: 'Rider left the vehicle mid-route' },
  { code: 'other', label: 'Other — explain below', hint: 'Reviewed weekly by compliance' },
] as const

type ReasonCode = (typeof REASONS)[number]['code']

/**
 * "Force complete": charges the rider and settles the driver for a trip the app never closed.
 *
 * Everything the design says the dialog must say, it says: what is charged to whom, that
 * the ledger entries cannot be unposted, and that the operator verified the ride with a
 * person first. The verification box is not decoration — the server refuses without it.
 */
export function ForceCompleteDialog({
  rideId,
  state,
  fareMinor,
  currency,
  riderName,
  driverName,
  paymentMethod,
  onDone,
}: {
  readonly rideId: string
  readonly state: string
  readonly fareMinor: number
  readonly currency: string
  readonly riderName: string | null
  readonly driverName: string | null
  readonly paymentMethod: string | null
  readonly onDone: () => void
}) {
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState<ReasonCode>('app_failed_to_close')
  const [note, setNote] = useState('')
  const [verified, setVerified] = useState(false)

  const complete = useMutation({
    mutationFn: () =>
      api.post<{ applied: boolean; auditRecordId: string }>(`/v1/admin/rides/${rideId}/force-complete`, {
        json: { reasonCode: reason, note: note.trim(), verified },
        idempotencyKey: newIdempotencyKey(),
      }),
    onSuccess: () => {
      setOpen(false)
      setNote('')
      setVerified(false)
      onDone()
    },
  })

  // Only a ride with a driver on it can be completed; a terminal one has nothing to complete.
  if (state === 'Completed' || state === 'Cancelled' || state === 'Expired' || state === 'Requested' || state === 'Draft' || state === 'Offered') {
    return null
  }

  return (
    <>
      <Button variant="secondary" size="sm" onClick={() => { setOpen(true) }}>Force complete…</Button>

      <Dialog
        open={open}
        onClose={() => { setOpen(false) }}
        title={`Force complete ${rideId}?`}
        subtitle="This ride never reached the rider's destination in the app. Forcing completion charges them anyway."
        tone="danger"
        footer={
          <>
            <Button variant="ghost" onClick={() => { setOpen(false) }}>Cancel</Button>
            <Button variant="danger" loading={complete.isPending} disabled={!verified || note.trim().length < 10} onClick={() => { complete.mutate() }}>
              Force complete · charge <Money minorUnits={fareMinor} currency={currency} className="ml-1" />
            </Button>
          </>
        }
      >
        <div className="rounded-lg border border-[color:var(--bg-danger)]/50 bg-danger-subtle p-4 text-[13px] text-fg-danger">
          <p className="font-semibold">What this does, immediately and irreversibly</p>
          <dl className="mt-2 space-y-1.5">
            <div className="flex justify-between gap-4"><dt>Charges {riderName ?? 'the rider'}</dt><dd className="tabular"><Money minorUnits={fareMinor} currency={currency} /> to {paymentMethod ?? 'the payment method on the ride'}</dd></div>
            <div className="flex justify-between gap-4"><dt>Credits {driverName ?? 'the driver'}</dt><dd className="tabular">their share of the fare, into the next payout</dd></div>
            <div className="flex justify-between gap-4"><dt>Posts to the ledger</dt><dd className="tabular">cannot be unposted, only reversed</dd></div>
            <div className="flex justify-between gap-4"><dt>Rider notification</dt><dd className="tabular">receipt sent within 60 seconds</dd></div>
          </dl>
        </div>

        <div role="radiogroup" aria-label="Reason code" className="space-y-2">
          <p className="text-[13px] font-medium">Reason code (required)</p>
          {REASONS.map((option) => {
            const selected = option.code === reason
            return (
              <button
                key={option.code}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => { setReason(option.code) }}
                className={cn(
                  'flex w-full items-start gap-3 rounded-lg border px-3.5 py-2.5 text-left transition-colors',
                  selected ? 'border-[color:var(--bg-brand)] bg-brand-subtle' : 'border-line bg-surface hover:bg-hover',
                )}
              >
                <span aria-hidden className={cn('mt-0.5 grid size-[16px] shrink-0 place-items-center rounded-full border-2', selected ? 'border-[var(--bg-brand)]' : 'border-line')}>
                  {selected && <span className="size-1.5 rounded-full bg-brand" />}
                </span>
                <span>
                  <span className={cn('block text-[13px] font-medium', selected ? 'text-fg-brand' : 'text-fg')}>{option.label}</span>
                  <span className="block text-[12px] text-fg-tertiary">{option.hint}</span>
                </span>
              </button>
            )
          })}
        </div>

        <Field label="Note for the audit log (required)" htmlFor="fc-note" hint="Stored against your name for 7 years">
          <TextArea id="fc-note" value={note} onChange={(e) => { setNote(e.target.value) }} placeholder="Driver confirmed drop-off at 14:28, app stuck in MATCHED." />
        </Field>

        <Checkbox
          checked={verified}
          onChange={setVerified}
          label="I have verified this ride with the driver or rider"
          description="Force-completing without contact is a policy breach and is reported to your team lead."
        />

        {complete.isError && <Notice tone="danger">{complete.error.message}</Notice>}
      </Dialog>
    </>
  )
}
