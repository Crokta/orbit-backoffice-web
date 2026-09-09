import { useMutation } from '@tanstack/react-query'
import { useState } from 'react'

import { Button } from '../../components/ui/Button'
import { Dialog } from '../../components/ui/Dialog'
import { Checkbox, Field, Notice, TextArea } from '../../components/ui/Inputs'
import { cn } from '../../components/ui/cn'
import { type CodeKind, type CodeStatus, deliveryApi, describeFailure } from './api'

/** The BFF's floor, matched here as a courtesy. The control is on the server. */
const MIN_REASON = 10

/**
 * "Override locked code": lets the courier past a code that three wrong attempts locked.
 *
 * There is no bypass in the courier app (REQ074). The bypass is here, behind a person who
 * has verified the sender or recipient by other means, and it is written to the audit log
 * against that person's name with the reason they gave (REQ126). The verification box is
 * not decoration — the server refuses without it.
 */
export function OverrideCodeDialog({
  deliveryId,
  reference,
  pickup,
  delivery,
  onDone,
}: {
  readonly deliveryId: string
  readonly reference: string
  readonly pickup: CodeStatus
  readonly delivery: CodeStatus
  readonly onDone: () => void
}) {
  const [open, setOpen] = useState(false)
  const [kind, setKind] = useState<CodeKind>(pickup.locked ? 'pickup' : 'delivery')
  const [reason, setReason] = useState('')
  const [verified, setVerified] = useState(false)

  const override = useMutation({
    mutationFn: () => deliveryApi.overrideCode(deliveryId, { codeKind: kind, reason: reason.trim(), verified }),
    onSuccess: () => {
      setOpen(false)
      setReason('')
      setVerified(false)
      onDone()
    },
  })

  // Nothing is locked: the control is not rendered rather than rendered and rejected.
  if (!pickup.locked && !delivery.locked) {
    return null
  }

  const options: readonly { readonly kind: CodeKind; readonly label: string; readonly status: CodeStatus }[] = [
    { kind: 'pickup', label: 'Pickup code', status: pickup },
    { kind: 'delivery', label: 'Delivery code', status: delivery },
  ]

  const canSubmit = verified && reason.trim().length >= MIN_REASON && (kind === 'pickup' ? pickup.locked : delivery.locked)

  return (
    <>
      <Button variant="secondary" size="sm" onClick={() => { setOpen(true) }}>Override locked code…</Button>

      <Dialog
        open={open}
        onClose={() => { setOpen(false) }}
        title={`Override a locked code on ${reference}?`}
        subtitle="Three wrong attempts locked it. Overriding lets the courier proceed without the code."
        tone="danger"
        footer={
          <>
            <Button variant="ghost" onClick={() => { setOpen(false) }}>Cancel</Button>
            <Button variant="danger" loading={override.isPending} disabled={!canSubmit} onClick={() => { override.mutate() }}>
              Override {kind} code
            </Button>
          </>
        }
      >
        <div className="rounded-lg border border-[color:var(--bg-danger)]/50 bg-danger-subtle p-4 text-[13px] text-fg-danger">
          <p className="font-semibold">What this does, immediately</p>
          <dl className="mt-2 space-y-1.5">
            <div className="flex justify-between gap-4"><dt>Marks the code</dt><dd>verified, without the code being entered</dd></div>
            <div className="flex justify-between gap-4"><dt>Records</dt><dd>your name and this reason, permanently, in the audit log</dd></div>
            <div className="flex justify-between gap-4"><dt>Tells the courier</dt><dd>they may hand over or collect</dd></div>
          </dl>
        </div>

        <div role="radiogroup" aria-label="Which code" className="space-y-2">
          <p className="text-[13px] font-medium">Which code</p>
          {options.map((option) => {
            const selected = option.kind === kind
            const disabled = !option.status.locked

            return (
              <button
                key={option.kind}
                type="button"
                role="radio"
                aria-checked={selected}
                disabled={disabled}
                onClick={() => { setKind(option.kind) }}
                className={cn(
                  'flex w-full items-start gap-3 rounded-lg border px-3.5 py-2.5 text-left transition-colors',
                  selected ? 'border-[color:var(--bg-brand)] bg-brand-subtle' : 'border-line bg-surface hover:bg-hover',
                  disabled && 'cursor-not-allowed opacity-60 hover:bg-surface',
                )}
              >
                <span aria-hidden className={cn('mt-0.5 grid size-[16px] shrink-0 place-items-center rounded-full border-2', selected ? 'border-[var(--bg-brand)]' : 'border-line')}>
                  {selected && <span className="size-1.5 rounded-full bg-brand" />}
                </span>
                <span>
                  <span className={cn('block text-[13px] font-medium', selected ? 'text-fg-brand' : 'text-fg')}>{option.label}</span>
                  <span className="tabular block text-[12px] text-fg-tertiary">
                    {option.status.locked
                      ? `Locked after ${String(option.status.attempts)} wrong ${option.status.attempts === 1 ? 'attempt' : 'attempts'}`
                      : option.status.verified
                        ? 'Already verified'
                        : 'Not locked'}
                  </span>
                </span>
              </button>
            )
          })}
        </div>

        <Field
          label="Reason (required)"
          htmlFor="oc-reason"
          hint={
            reason.trim().length < MIN_REASON
              ? `${String(MIN_REASON - reason.trim().length)} more characters needed. Say how you verified them.`
              : 'Stored against your name in the audit log.'
          }
        >
          <TextArea
            id="oc-reason"
            value={reason}
            onChange={(e) => { setReason(e.target.value) }}
            placeholder="Recipient confirmed the reference and the sender's name over the phone; SMS never arrived."
          />
        </Field>

        <Checkbox
          checked={verified}
          onChange={setVerified}
          label="I have verified the sender or recipient by other means"
          description="A phone call, the booking reference, the sender's name. Overriding without contact is a policy breach."
        />

        {override.isError && <Notice tone="danger">{describeFailure(override.error, 'The override was refused. Nothing has changed.')}</Notice>}
      </Dialog>
    </>
  )
}
