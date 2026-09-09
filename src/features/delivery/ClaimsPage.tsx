import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { useMemo, useState } from 'react'

import { Button } from '../../components/ui/Button'
import { Dialog } from '../../components/ui/Dialog'
import { Field, Notice, PrefixedInput, Select, TextArea, TextInput } from '../../components/ui/Inputs'
import { LoadError } from '../../components/ui/LoadError'
import { Money } from '../../components/ui/Money'
import { StatusPill } from '../../components/ui/StatusPill'
import { formatDateTime, parseMoneyToMinor } from '../../lib/format'
import { usePagedList } from '../../lib/paging'
import { Chips, Pagination } from '../shared/ListControls'
import {
  CLAIM_STATUSES,
  CLAIM_STATUS_LABEL,
  type Claim,
  type ClaimListFilters,
  type ClaimStatus,
  claimStatusTone,
  deliveryApi,
  deliveryKeys,
  describeFailure,
} from './api'

type StatusChip = 'all' | ClaimStatus

const STATUS_CHIPS: readonly { readonly value: StatusChip; readonly label: string }[] = [
  { value: 'all', label: 'All' },
  ...CLAIM_STATUSES.map((status) => ({ value: status, label: CLAIM_STATUS_LABEL[status] })),
]

const HEADERS = ['Claim', 'Delivery', 'Kind', 'Status', 'Custody window', 'Insurer ref', 'Claimed', 'Recovered', ''] as const

/**
 * Every loss or damage claim (REQ127): what was reported, the custody window it falls in,
 * the insurer's reference and what came back. The photographs are on the delivery.
 */
export function ClaimsPage() {
  const [status, setStatus] = useState<StatusChip>('all')
  const [editing, setEditing] = useState<Claim | null>(null)

  const filters = useMemo<ClaimListFilters>(() => ({ status: status === 'all' ? undefined : status, deliveryId: undefined }), [status])

  const list = usePagedList({
    key: deliveryKeys.claims(),
    filters,
    fetchPage: (params) => deliveryApi.claims(params),
  })

  return (
    <div className="space-y-5">
      <header>
        <p className="text-[12px]"><Link to="/deliveries" className="text-fg-brand hover:underline">Deliveries</Link></p>
        <h1 className="text-[22px] font-semibold leading-[28px]">Claims</h1>
        <p className="mt-0.5 text-[13px] text-fg-secondary">Reported loss or damage, and what the insurer did about it. Recoveries post against the original delivery (REQ134).</p>
      </header>

      <Chips<StatusChip> label="Claim status" value={status} options={STATUS_CHIPS} onChange={setStatus} />

      {list.query.isError ? (
        <LoadError error={list.query.error} what="the claims list" onRetry={() => { void list.query.refetch() }} />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-line-subtle bg-surface">
          <table className="w-full min-w-[1080px] border-collapse text-[13px]">
            <thead>
              <tr className="border-b border-line-subtle">
                {HEADERS.map((header, index) => (
                  <th
                    key={header.length === 0 ? 'actions' : header}
                    scope="col"
                    className={`px-4 py-3 text-[11px] font-semibold uppercase tracking-wide text-fg-tertiary ${index === 6 || index === 7 ? 'text-right' : 'text-left'}`}
                  >
                    {header}
                  </th>
                ))}
              </tr>
            </thead>

            <tbody>
              {list.query.isPending ? (
                <tr><td colSpan={HEADERS.length} className="px-4 py-10 text-center text-fg-tertiary">Loading…</td></tr>
              ) : list.items.length === 0 ? (
                <tr><td colSpan={HEADERS.length} className="px-4 py-10 text-center text-fg-tertiary">No claim matches that.</td></tr>
              ) : (
                list.items.map((claim) => (
                  <tr key={claim.claimId} className="border-b border-line-subtle last:border-0 hover:bg-hover">
                    <td className="px-4 py-3">
                      <span className="tabular block font-medium">{claim.claimId}</span>
                      <span className="block max-w-[260px] truncate text-[12px] text-fg-tertiary" title={claim.description}>{claim.description}</span>
                    </td>
                    <td className="px-4 py-3">
                      <Link to="/delivery/$deliveryId" params={{ deliveryId: claim.deliveryId }} className="tabular text-fg-brand underline-offset-2 hover:underline">
                        {claim.reference}
                      </Link>
                    </td>
                    <td className="px-4 py-3 capitalize">{claim.kind}</td>
                    <td className="px-4 py-3"><StatusPill status={claimStatusTone(claim.status)} label={CLAIM_STATUS_LABEL[claim.status]} /></td>
                    <td className="whitespace-nowrap px-4 py-3 text-[12px] text-fg-secondary">
                      {claim.custodyFrom === null ? '—' : `${formatDateTime(claim.custodyFrom)} → ${formatDateTime(claim.custodyTo)}`}
                      {claim.courierId !== null && <span className="tabular block text-fg-tertiary">courier {claim.courierId}</span>}
                    </td>
                    <td className="tabular px-4 py-3 text-fg-secondary">{claim.insurerReference ?? <span className="text-fg-tertiary">—</span>}</td>
                    <td className="px-4 py-3 text-right"><Money minorUnits={claim.claimedAmountMinor} currency={claim.currency} /></td>
                    <td className="px-4 py-3 text-right">
                      {claim.recoveredAmountMinor === null ? <span className="text-fg-tertiary">—</span> : <Money minorUnits={claim.recoveredAmountMinor} currency={claim.currency} />}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Button variant="secondary" size="sm" onClick={() => { setEditing(claim) }}>Update…</Button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      <Pagination list={list} />

      <UpdateClaimDialog claim={editing} onClose={() => { setEditing(null) }} />
    </div>
  )
}

/** Moves a claim along: the insurer's reference, its status, and what was recovered. */
function UpdateClaimDialog({ claim, onClose }: { readonly claim: Claim | null; readonly onClose: () => void }) {
  const queryClient = useQueryClient()

  // Keyed on the claim so that the form resets when a different row is opened.
  return claim === null ? null : <UpdateClaimForm key={claim.claimId} claim={claim} onClose={onClose} onDone={() => { void queryClient.invalidateQueries({ queryKey: deliveryKeys.claims() }) }} />
}

function UpdateClaimForm({ claim, onClose, onDone }: { readonly claim: Claim; readonly onClose: () => void; readonly onDone: () => void }) {
  const [status, setStatus] = useState<ClaimStatus>(claim.status)
  const [insurerReference, setInsurerReference] = useState(claim.insurerReference ?? '')
  const [recovered, setRecovered] = useState(claim.recoveredAmountMinor === null ? '' : (claim.recoveredAmountMinor / 100).toFixed(2))
  const [note, setNote] = useState('')

  const recoveredMinor = parseMoneyToMinor(recovered)

  const update = useMutation({
    mutationFn: () =>
      deliveryApi.updateClaim(claim.claimId, {
        ...(status === claim.status ? {} : { status }),
        ...(insurerReference.trim() === (claim.insurerReference ?? '') ? {} : { insurerReference: insurerReference.trim() }),
        ...(recoveredMinor === undefined || recoveredMinor === claim.recoveredAmountMinor ? {} : { recoveredAmountMinor: recoveredMinor }),
        ...(note.trim().length > 0 ? { note: note.trim() } : {}),
      }),
    onSuccess: () => {
      onDone()
      onClose()
    },
  })

  const recoveredInvalid = recovered.trim().length > 0 && recoveredMinor === undefined
  const needsRecovery = status === 'recovered' && (recoveredMinor === undefined || recoveredMinor === 0)

  return (
    <Dialog
      open
      onClose={onClose}
      title={`Update claim ${claim.claimId}`}
      subtitle={`${claim.kind === 'loss' ? 'Loss' : 'Damage'} on ${claim.reference} · claimed ${(claim.claimedAmountMinor / 100).toLocaleString('en-NG', { style: 'currency', currency: claim.currency })}`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button loading={update.isPending} disabled={recoveredInvalid || needsRecovery} onClick={() => { update.mutate() }}>Save</Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Status" htmlFor="uc-status">
          <Select id="uc-status" value={status} onChange={(e) => { setStatus(e.target.value as ClaimStatus) }}>
            {CLAIM_STATUSES.map((option) => (
              <option key={option} value={option}>{CLAIM_STATUS_LABEL[option]}</option>
            ))}
          </Select>
        </Field>
        <Field label="Insurer reference" htmlFor="uc-ref" hint="As it appears on the insurer's correspondence.">
          <TextInput id="uc-ref" value={insurerReference} onChange={(e) => { setInsurerReference(e.target.value) }} placeholder="LDN-2026-004512" autoComplete="off" />
        </Field>
      </div>

      <Field
        label="Amount recovered"
        htmlFor="uc-recovered"
        hint="Posts against the original delivery, so the true cost of the claim is traceable."
        error={recoveredInvalid ? 'Not a number.' : needsRecovery ? 'A recovered claim needs the amount that came back.' : undefined}
      >
        <PrefixedInput id="uc-recovered" prefix="₦" inputMode="decimal" value={recovered} onChange={(e) => { setRecovered(e.target.value) }} placeholder="0.00" />
      </Field>

      <Field label="Note" htmlFor="uc-note" hint="Optional. Kept on the claim against your name.">
        <TextArea id="uc-note" value={note} onChange={(e) => { setNote(e.target.value) }} placeholder="Insurer accepted at 80% of declared value; balance written off." />
      </Field>

      {update.isError && <Notice tone="danger">{describeFailure(update.error, 'The claim could not be updated.')}</Notice>}
    </Dialog>
  )
}
