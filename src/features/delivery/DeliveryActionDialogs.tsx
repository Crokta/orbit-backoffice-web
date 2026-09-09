import { useMutation, useQuery } from '@tanstack/react-query'
import { useState } from 'react'

import { Button } from '../../components/ui/Button'
import { Dialog } from '../../components/ui/Dialog'
import { Field, Notice, PrefixedInput, Select, TextArea, TextInput } from '../../components/ui/Inputs'
import { Money } from '../../components/ui/Money'
import { cn } from '../../components/ui/cn'
import { parseMoneyToMinor } from '../../lib/format'
import { fleetApi, fleetKeys } from '../fleet/api'
import {
  type ClaimKind,
  type DeliveryException,
  type DeliveryState,
  type DepotEvent,
  type ExceptionResolution,
  REPORTED_KIND_LABEL,
  RESOLUTION_LABEL,
  deliveryApi,
  describeFailure,
  isTerminal,
} from './api'

const MIN_NOTE = 10

/**
 * The four ways an exception ends (REQ034): the courier carries on, the job is re-quoted
 * for what the item actually is, it is cancelled with the base fare kept, or it goes back.
 */
export function ResolveExceptionDialog({
  deliveryId,
  exception,
  onClose,
  onDone,
}: {
  readonly deliveryId: string
  readonly exception: DeliveryException | null
  readonly onClose: () => void
  readonly onDone: () => void
}) {
  const [resolution, setResolution] = useState<ExceptionResolution>('dismiss')
  const [quoteToken, setQuoteToken] = useState('')
  const [note, setNote] = useState('')

  const resolve = useMutation({
    mutationFn: (exceptionId: string) =>
      deliveryApi.resolveException(deliveryId, exceptionId, {
        resolution,
        ...(resolution === 'requote' ? { quoteToken: quoteToken.trim() } : {}),
        ...(note.trim().length > 0 ? { note: note.trim() } : {}),
      }),
    onSuccess: () => {
      setNote('')
      setQuoteToken('')
      onDone()
      onClose()
    },
  })

  const canSubmit = exception !== null && (resolution !== 'requote' || quoteToken.trim().length > 0)

  return (
    <Dialog
      open={exception !== null}
      onClose={onClose}
      title="Resolve the exception"
      subtitle={exception === null ? undefined : `${REPORTED_KIND_LABEL[exception.kind] ?? exception.kind} · reported ${exception.reportedBy ?? 'by the courier'}`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button
            variant={resolution === 'dismiss' ? 'primary' : 'danger'}
            loading={resolve.isPending}
            disabled={!canSubmit}
            onClick={() => { if (exception !== null) { resolve.mutate(exception.exceptionId) } }}
          >
            {RESOLUTION_LABEL[resolution]}
          </Button>
        </>
      }
    >
      {exception?.note != null && exception.note.length > 0 && (
        <p className="rounded-lg bg-subtle px-3 py-2 text-[13px] text-fg-secondary">“{exception.note}”</p>
      )}

      <RadioList<ExceptionResolution>
        label="Resolution"
        value={resolution}
        onChange={setResolution}
        options={[
          { value: 'dismiss', label: RESOLUTION_LABEL.dismiss, hint: 'The declaration stands. The courier proceeds at the quoted fare.' },
          { value: 'requote', label: RESOLUTION_LABEL.requote, hint: 'Paste the new quote token for the tier the item actually needs. The sender pays the difference.' },
          { value: 'cancel_retain_base', label: RESOLUTION_LABEL.cancel_retain_base, hint: 'The delivery is cancelled. The base fare is kept; the rest is refunded through the usual flow.' },
          { value: 'return', label: RESOLUTION_LABEL.return, hint: 'The item goes back to the sender. The return leg is charged at 60% of the outbound distance.' },
        ]}
      />

      {resolution === 'requote' && (
        <Field label="Quote token" htmlFor="rx-token" hint="From a fresh delivery quote for the correct tier and weight.">
          <TextInput id="rx-token" value={quoteToken} onChange={(e) => { setQuoteToken(e.target.value) }} placeholder="eyJraW5kIjoiZGVsaXZlcnkiLCJ0aWVyIjoiVmFuIn0…" autoComplete="off" />
        </Field>
      )}

      <Field label="Note" htmlFor="rx-note" hint="Optional. Goes into the custody record against your name.">
        <TextArea id="rx-note" value={note} onChange={(e) => { setNote(e.target.value) }} placeholder="Called the sender; agreed to the Van rate." />
      </Field>

      {resolve.isError && <Notice tone="danger">{describeFailure(resolve.error, 'The resolution was refused. Nothing has changed.')}</Notice>}
    </Dialog>
  )
}


const CANCEL_REASONS = [
  { code: 'sender_request', label: 'Sender asked us to cancel', hint: 'Full refund minus any fee the state allows' },
  { code: 'prohibited_item', label: 'Prohibited item', hint: 'Reported by the courier or found at the depot' },
  { code: 'no_courier_available', label: 'No courier available', hint: 'Dispatch exhausted; sender told honestly (REQ043)' },
  { code: 'fraud_suspected', label: 'Fraud suspected', hint: 'Escalated to the fraud queue as well' },
  { code: 'other', label: 'Other — explain below', hint: 'Reviewed weekly by operations' },
] as const

type CancelReason = (typeof CANCEL_REASONS)[number]['code']

/**
 * "Force cancel": voids a delivery the state machine has got stuck on.
 *
 * It goes through the ordinary cancellation path, so the sender and courier are notified
 * as usual and the refund follows the existing flow, four-eyes above ₦10,000 (REQ133).
 */
export function ForceCancelDialog({
  deliveryId,
  reference,
  state,
  fareMinor,
  currency,
  onDone,
}: {
  readonly deliveryId: string
  readonly reference: string
  readonly state: DeliveryState
  readonly fareMinor: number
  readonly currency: string
  readonly onDone: () => void
}) {
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState<CancelReason>('sender_request')
  const [note, setNote] = useState('')

  const cancel = useMutation({
    mutationFn: () => deliveryApi.cancel(deliveryId, { reasonCode: reason, note: note.trim() }),
    onSuccess: () => {
      setOpen(false)
      setNote('')
      onDone()
    },
  })

  if (isTerminal(state)) {
    return null
  }

  return (
    <>
      <Button variant="danger" size="sm" onClick={() => { setOpen(true) }}>Force cancel…</Button>

      <Dialog
        open={open}
        onClose={() => { setOpen(false) }}
        title={`Force cancel ${reference}?`}
        subtitle="For a delivery the state machine has got stuck on. The sender and courier are notified as usual."
        tone="danger"
        footer={
          <>
            <Button variant="ghost" onClick={() => { setOpen(false) }}>Keep it</Button>
            <Button variant="danger" loading={cancel.isPending} disabled={note.trim().length < MIN_NOTE} onClick={() => { cancel.mutate() }}>
              Force cancel · refund up to <Money minorUnits={fareMinor} currency={currency} className="ml-1" />
            </Button>
          </>
        }
      >
        <RadioList<CancelReason>
          label="Reason code (required)"
          value={reason}
          onChange={setReason}
          options={CANCEL_REASONS.map((option) => ({ value: option.code, label: option.label, hint: option.hint }))}
        />

        <Field
          label="Note for the audit log (required)"
          htmlFor="fc-note"
          hint={note.trim().length < MIN_NOTE ? `${String(MIN_NOTE - note.trim().length)} more characters needed` : 'Stored against your name for 7 years'}
        >
          <TextArea id="fc-note" value={note} onChange={(e) => { setNote(e.target.value) }} placeholder="Sender called at 14:10; courier's bike broke down and nobody else accepted." />
        </Field>

        {cancel.isError && <Notice tone="danger">{describeFailure(cancel.error, 'The cancellation was refused. Nothing has changed.')}</Notice>}
      </Dialog>
    </>
  )
}

const DEPOT_EVENTS: readonly { readonly value: DepotEvent; readonly label: string; readonly hint: string }[] = [
  { value: 'received', label: 'Received at depot', hint: 'The item is physically on the shelf. Starts the seven-day hold notice to the sender.' },
  { value: 'collected', label: 'Collected by the sender', hint: 'Handed back over the counter. Closes the hold.' },
  { value: 'returned_to_sender', label: 'Returned to sender', hint: 'The return leg completed at the sender’s address.' },
  { value: 'disposed', label: 'Disposed', hint: 'Unclaimed past the hold period and disposed of per policy.' },
]

/**
 * "Depot event": what physically happened to an item that came off the road (REQ128).
 *
 * `received` needs a depot, so the reconciliation later knows which shelf to check. The
 * other three close a hold that a `received` opened.
 */
export function DepotEventDialog({
  deliveryId,
  reference,
  state,
  currentDepotId,
  onDone,
}: {
  readonly deliveryId: string
  readonly reference: string
  readonly state: DeliveryState
  readonly currentDepotId: string | null
  readonly onDone: () => void
}) {
  const [open, setOpen] = useState(false)
  const [event, setEvent] = useState<DepotEvent>(currentDepotId === null ? 'received' : 'collected')
  const [depotId, setDepotId] = useState(currentDepotId ?? '')
  const [note, setNote] = useState('')

  // Fetched only once the dialog is open. Most deliveries never see a depot.
  const depots = useQuery({ queryKey: fleetKeys.depots(), queryFn: fleetApi.depots, enabled: open })

  const record = useMutation({
    mutationFn: () =>
      deliveryApi.depotEvent(deliveryId, {
        event,
        ...(depotId.length > 0 ? { depotId } : {}),
        ...(note.trim().length > 0 ? { note: note.trim() } : {}),
      }),
    onSuccess: () => {
      setOpen(false)
      setNote('')
      onDone()
    },
  })

  if (state === 'Cancelled' || state === 'Settled' || state === 'Delivered') {
    return null
  }

  const canSubmit = event !== 'received' || depotId.length > 0

  return (
    <>
      <Button variant="secondary" size="sm" onClick={() => { setOpen(true) }}>Depot event…</Button>

      <Dialog
        open={open}
        onClose={() => { setOpen(false) }}
        title={`Record a depot event on ${reference}`}
        subtitle="What physically happened to the item. The custody record gets a line with your name on it."
        footer={
          <>
            <Button variant="ghost" onClick={() => { setOpen(false) }}>Cancel</Button>
            <Button loading={record.isPending} disabled={!canSubmit} onClick={() => { record.mutate() }}>Record</Button>
          </>
        }
      >
        <RadioList<DepotEvent> label="Event" value={event} onChange={setEvent} options={DEPOT_EVENTS} />

        <Field label={event === 'received' ? 'Depot (required)' : 'Depot'} htmlFor="de-depot" hint={depots.isError ? 'The depot list could not be loaded.' : undefined}>
          <Select id="de-depot" value={depotId} onChange={(e) => { setDepotId(e.target.value) }} disabled={depots.isPending}>
            <option value="">{depots.isPending ? 'Loading depots…' : 'Choose a depot'}</option>
            {(depots.data ?? []).map((depot) => (
              <option key={depot.depotId} value={depot.depotId}>{depot.name} · {depot.address}</option>
            ))}
          </Select>
        </Field>

        <Field label="Note" htmlFor="de-note" hint="Optional. Shelf, bay, who handed it over.">
          <TextArea id="de-note" value={note} onChange={(e) => { setNote(e.target.value) }} placeholder="Shelf B4. Sender collected with ID." />
        </Field>

        {record.isError && <Notice tone="danger">{describeFailure(record.error, 'The event was refused. Nothing has changed.')}</Notice>}
      </Dialog>
    </>
  )
}

/** "Open claim": a reported loss or damage, against this delivery's custody window (REQ127). */
export function OpenClaimDialog({
  deliveryId,
  reference,
  declaredValueMinor,
  currency,
  onDone,
}: {
  readonly deliveryId: string
  readonly reference: string
  readonly declaredValueMinor: number | null
  readonly currency: string
  readonly onDone: () => void
}) {
  const [open, setOpen] = useState(false)
  const [kind, setKind] = useState<ClaimKind>('damage')
  const [description, setDescription] = useState('')
  const [amount, setAmount] = useState('')

  const claimedAmountMinor = parseMoneyToMinor(amount)

  const create = useMutation({
    mutationFn: () => deliveryApi.openClaim(deliveryId, { kind, description: description.trim(), claimedAmountMinor: claimedAmountMinor ?? 0 }),
    onSuccess: () => {
      setOpen(false)
      setDescription('')
      setAmount('')
      onDone()
    },
  })

  const overCap = declaredValueMinor !== null && claimedAmountMinor !== undefined && claimedAmountMinor > declaredValueMinor
  const canSubmit = description.trim().length >= MIN_NOTE && claimedAmountMinor !== undefined && claimedAmountMinor > 0

  return (
    <>
      <Button variant="secondary" size="sm" onClick={() => { setOpen(true) }}>Open claim…</Button>

      <Dialog
        open={open}
        onClose={() => { setOpen(false) }}
        title={`Open a claim on ${reference}`}
        subtitle="Records the loss or damage against this delivery's custody window and photographs. The insurer reference is added later."
        footer={
          <>
            <Button variant="ghost" onClick={() => { setOpen(false) }}>Cancel</Button>
            <Button loading={create.isPending} disabled={!canSubmit} onClick={() => { create.mutate() }}>Open claim</Button>
          </>
        }
      >
        <RadioList<ClaimKind>
          label="Kind"
          value={kind}
          onChange={setKind}
          options={[
            { value: 'damage', label: 'Damage', hint: 'The item arrived, but not in the condition it left in.' },
            { value: 'loss', label: 'Loss', hint: 'The item did not arrive and cannot be found.' },
          ]}
        />

        <Field
          label="What happened (required)"
          htmlFor="cl-desc"
          hint={description.trim().length < MIN_NOTE ? `${String(MIN_NOTE - description.trim().length)} more characters needed` : undefined}
        >
          <TextArea id="cl-desc" value={description} onChange={(e) => { setDescription(e.target.value) }} placeholder="Recipient reports the screen cracked; delivery photo shows the box crushed on one corner." />
        </Field>

        <Field
          label="Amount claimed"
          htmlFor="cl-amount"
          hint={
            declaredValueMinor === null
              ? 'In naira.'
              : (
                <>
                  Declared value <Money minorUnits={declaredValueMinor} currency={currency} />. Cover is capped there.
                </>
              )
          }
          error={overCap ? 'More than the declared value. The insurer will not pay above it.' : undefined}
        >
          <PrefixedInput id="cl-amount" prefix="₦" inputMode="decimal" value={amount} onChange={(e) => { setAmount(e.target.value) }} placeholder="45,000" />
        </Field>

        {create.isError && <Notice tone="danger">{describeFailure(create.error, 'The claim could not be opened.')}</Notice>}
      </Dialog>
    </>
  )
}

/** The radio list every one of these dialogs uses, drawn the way ForceCompleteDialog draws its reasons. */
export function RadioList<T extends string>({
  label,
  value,
  onChange,
  options,
}: {
  readonly label: string
  readonly value: T
  readonly onChange: (value: T) => void
  readonly options: readonly { readonly value: T; readonly label: string; readonly hint: string }[]
}) {
  return (
    <div role="radiogroup" aria-label={label} className="space-y-2">
      <p className="text-[13px] font-medium">{label}</p>
      {options.map((option) => {
        const selected = option.value === value

        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => { onChange(option.value) }}
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
  )
}
