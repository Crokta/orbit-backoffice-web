import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useParams } from '@tanstack/react-router'
import { useState } from 'react'

import { Button } from '../../components/ui/Button'
import { Checkbox, Field, Notice, TextArea } from '../../components/ui/Inputs'
import { LoadError } from '../../components/ui/LoadError'
import { cn } from '../../components/ui/cn'
import { api, newIdempotencyKey } from '../../lib/api/client'

interface KycDetail {
  readonly driverId: string
  readonly displayName: string
  readonly phone: string
  /** NotStarted, Pending, InReview, Approved, Rejected or Expired. */
  readonly kycStatus: string
  readonly submittedAt: string
  readonly updatedAt: string
  readonly isDispatchable: boolean
  readonly blockingReason: string | null
  readonly rejectionReason: string | null
  readonly approvedBy: string | null
  readonly rejectedBy: string | null
  readonly resubmissionRequestedAt: string | null
  readonly documents: readonly KycDocument[]
  readonly checks: readonly KycCheck[]
  readonly identity: { readonly submitted: boolean; readonly bvnMasked: string | null; readonly ninMasked: string | null }
  readonly rating: number | null
  readonly completedRides: number | null
}

interface KycDocument {
  readonly type: string
  readonly status: 'pending' | 'accepted' | 'expired' | 'resubmit'
  readonly expiresAt: string | null
  readonly uploadedAt: string
}

interface KycCheck {
  readonly name: string
  readonly outcome: 'pass' | 'fail' | 'review'
  readonly detail: string
}

type Decision = 'approve' | 'reject' | 'resubmit'

const DOCUMENT_LABEL: Record<string, string> = {
  drivers_licence: "Driver's licence",
  licence: "Driver's licence",
  insurance_certificate: 'Insurance certificate',
  insurance: 'Insurance certificate',
  roadworthiness: 'Roadworthiness certificate',
  vehicle_registration: 'Vehicle registration',
  registration: 'Vehicle registration',
  selfie: 'Selfie / liveness',
}

/**
 * One driver's compliance file, and the decision.
 *
 * Laid out the way the design lays it out: documents and screening on the left, the
 * applicant, the review stages and the decision on the right. A rejection or a request to
 * resubmit needs a reason, and the reason is shown to the driver — §11.2 requires an appeal
 * path, and an appeal against an unexplained decision is not one.
 */
export function DriverKycPage() {
  const { driverId } = useParams({ from: '/authenticated/kyc/$driverId' })
  const queryClient = useQueryClient()
  const [reason, setReason] = useState('')
  const [sendBack, setSendBack] = useState<readonly string[]>([])

  const detail = useQuery({
    queryKey: ['compliance', 'driver', driverId],
    queryFn: () => api.get<KycDetail>(`/v1/admin/compliance/drivers/${driverId}`),
  })

  const decide = useMutation({
    mutationFn: (decision: Decision) =>
      api.post<KycDetail>(`/v1/admin/compliance/drivers/${driverId}/decide`, {
        json: { decision, reason: reason.trim(), documentTypes: decision === 'resubmit' ? sendBack : [] },
        idempotencyKey: newIdempotencyKey(),
      }),
    onSuccess: (updated) => {
      queryClient.setQueryData(['compliance', 'driver', driverId], updated)
      void queryClient.invalidateQueries({ queryKey: ['compliance'] })
      void queryClient.invalidateQueries({ queryKey: ['live-ops'] })
      setReason('')
      setSendBack([])
    },
  })

  if (detail.isPending) {
    return <p className="text-[13px] text-fg-secondary">Loading…</p>
  }

  if (detail.isError) {
    return <LoadError error={detail.error} what="this driver" onRetry={() => { void detail.refetch() }} />
  }

  const d = detail.data
  const decided = d.kycStatus === 'Approved' || d.kycStatus === 'Rejected'
  const sentBack = d.resubmissionRequestedAt !== null
  const waitingHours = Math.max(0, (Date.now() - new Date(d.submittedAt).getTime()) / 3_600_000)
  const reasonOk = reason.trim().length >= 10
  const stages = reviewStages(d)

  return (
    <div className="space-y-5">
      <header>
        <p className="text-[12px]"><Link to="/compliance" className="text-fg-brand hover:underline">Compliance queue</Link></p>
        <h1 className="text-[22px] font-semibold leading-[28px]">
          {d.displayName} <span className="tabular font-normal text-fg-tertiary">· {d.driverId}</span>
        </h1>
        <p className="mt-0.5 text-[13px] text-fg-secondary">
          Submitted {new Date(d.submittedAt).toLocaleString('en-NG', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
          {' · '}
          {decided ? statusLabel(d) : d.resubmissionRequestedAt !== null ? `sent back ${new Date(d.resubmissionRequestedAt).toLocaleDateString('en-NG')} · waiting on the driver` : `in review ${waitingHours.toFixed(0)} h`}
        </p>
      </header>

      {d.kycStatus === 'Rejected' && (
        <Notice tone="danger" title={`Rejected${d.rejectedBy === null ? '' : ` by ${d.rejectedBy}`}`}>{d.rejectionReason}</Notice>
      )}
      {d.kycStatus === 'Approved' && (
        <Notice tone={d.isDispatchable ? 'success' : 'warning'} title={`Approved${d.approvedBy === null ? '' : ` by ${d.approvedBy}`}`}>
          {d.isDispatchable ? 'Dispatchable.' : `Approved but not dispatchable: ${d.blockingReason ?? 'see documents'}.`}
        </Notice>
      )}
      {sentBack && !decided && (
        <Notice tone="warning" title="Documents sent back">{d.rejectionReason} — the case returns to the queue when the driver uploads again.</Notice>
      )}

      <div className="grid gap-4 xl:grid-cols-[1fr_400px]">
        <div className="space-y-4">
          <section className="rounded-xl border border-line-subtle bg-surface p-4">
            <h2 className="text-[15px] font-semibold">Submitted documents</h2>
            <p className="text-[12px] text-fg-tertiary">The files live in identity's document store; this console sees their status, not their contents.</p>

            {d.documents.length === 0 ? (
              <p className="mt-3 text-[13px] text-fg-tertiary">Nothing submitted yet.</p>
            ) : (
              <ul className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {d.documents.map((doc) => (
                  <li
                    key={doc.type}
                    className={cn(
                      'rounded-lg border p-3',
                      doc.status === 'accepted' ? 'border-[color:var(--bg-success)]/50' : doc.status === 'expired' ? 'border-[color:var(--bg-danger)]/60' : 'border-[color:var(--bg-warning)]/60',
                    )}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-[13px] font-medium">{DOCUMENT_LABEL[doc.type] ?? doc.type}</p>
                      <span
                        className={cn(
                          'shrink-0 rounded-[4px] px-1.5 py-0.5 text-[11px] font-semibold',
                          doc.status === 'accepted' ? 'bg-success-subtle text-fg-success' : doc.status === 'expired' ? 'bg-danger-subtle text-fg-danger' : 'bg-warning-subtle text-fg-warning',
                        )}
                      >
                        {doc.status === 'accepted' ? 'Verified' : doc.status === 'expired' ? 'Expired' : doc.status === 'resubmit' ? 'Sent back' : 'Needs review'}
                      </span>
                    </div>
                    <p className="tabular mt-1 text-[11px] text-fg-tertiary">
                      Uploaded {new Date(doc.uploadedAt).toLocaleDateString('en-NG')}
                      {doc.expiresAt === null ? ' · no expiry' : ` · expires ${new Date(doc.expiresAt).toLocaleDateString('en-NG')}`}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="rounded-xl border border-line-subtle bg-surface p-4">
            <h2 className="text-[15px] font-semibold">Screening results</h2>
            <p className="text-[12px] text-fg-tertiary">Never shown to the applicant</p>

            <dl className="mt-2">
              {d.checks.map((check) => (
                <div key={check.name} className="flex items-baseline justify-between gap-4 border-b border-line-subtle py-2.5 last:border-0">
                  <dt className="text-[13px] text-fg-secondary">{check.name}</dt>
                  <dd className={cn('text-right text-[13px] font-medium', check.outcome === 'pass' ? 'text-fg-success' : check.outcome === 'fail' ? 'text-fg-danger' : 'text-fg-warning')}>
                    {check.detail}
                  </dd>
                </div>
              ))}
            </dl>
          </section>
        </div>

        <div className="space-y-4">
          <section className="rounded-xl border border-line-subtle bg-surface p-4">
            <div className="flex items-center gap-3">
              <span aria-hidden className="grid size-10 shrink-0 place-items-center rounded-full bg-subtle text-[13px] font-semibold text-fg-secondary">
                {initials(d.displayName)}
              </span>
              <div className="min-w-0">
                <p className="text-[15px] font-semibold">{d.displayName}</p>
                <p className="tabular text-[11px] text-fg-tertiary">{d.driverId}</p>
              </div>
            </div>
            <dl className="mt-3">
              <Row label="Phone" value={d.phone.length === 0 ? '—' : d.phone} mono />
              <Row label="BVN" value={d.identity.bvnMasked ?? 'Not submitted'} mono />
              <Row label="NIN" value={d.identity.ninMasked ?? 'Not submitted'} mono />
              {d.rating !== null && <Row label="Rating" value={`${d.rating.toFixed(2)} · ${String(d.completedRides ?? 0)} rides`} mono />}
            </dl>
          </section>

          <section className="rounded-xl border border-line-subtle bg-surface p-4">
            <h2 className="text-[15px] font-semibold">Review stages</h2>
            <p className="text-[12px] text-fg-tertiary">All must pass before approval</p>
            <dl className="mt-2">
              {stages.map((stage) => (
                <Row key={stage.name} label={stage.name} value={stage.detail} tone={stage.tone} />
              ))}
            </dl>
          </section>

          <section className="rounded-xl border border-line-subtle bg-surface p-4">
            <h2 className="text-[15px] font-semibold">Decision</h2>
            <p className="text-[12px] text-fg-tertiary">Recorded in the audit log with your name</p>

            {decided ? (
              <p className="mt-3 text-[13px] text-fg-secondary">This case has been decided. {d.kycStatus === 'Rejected' ? 'The driver may reapply after 90 days.' : ''}</p>
            ) : (
              <div className="mt-3 space-y-3">
                <Field label="Reviewer note (required to reject or send back)" htmlFor="kyc-reason">
                  <TextArea id="kyc-reason" value={reason} onChange={(e) => { setReason(e.target.value) }} placeholder="Insurance legible, expiry in range. Dup match cleared." />
                </Field>

                <div className="space-y-2">
                  <p className="text-[12px] font-medium text-fg-secondary">Send back only some documents</p>
                  {d.documents.map((doc) => (
                    <Checkbox
                      key={doc.type}
                      checked={sendBack.includes(doc.type)}
                      onChange={(checked) => { setSendBack(checked ? [...sendBack, doc.type] : sendBack.filter((t) => t !== doc.type)) }}
                      label={DOCUMENT_LABEL[doc.type] ?? doc.type}
                    />
                  ))}
                  <p className="text-[11px] text-fg-tertiary">Nothing ticked sends every document back.</p>
                </div>

                <Button className="w-full" loading={decide.isPending && decide.variables === 'approve'} onClick={() => { decide.mutate('approve') }}>
                  Approve driver
                </Button>
                <div className="flex gap-2">
                  <Button variant="secondary" className="flex-1" disabled={!reasonOk} loading={decide.isPending && decide.variables === 'resubmit'} onClick={() => { decide.mutate('resubmit') }}>
                    Request resubmission
                  </Button>
                  <Button variant="danger" className="flex-1" disabled={!reasonOk} loading={decide.isPending && decide.variables === 'reject'} onClick={() => { decide.mutate('reject') }}>
                    Reject
                  </Button>
                </div>

                {decide.isError && <p role="alert" className="text-[12px] text-fg-danger">{decide.error.message}</p>}

                <p className="text-[11px] text-fg-tertiary">
                  Rejection requires a reason and is final for 90 days. The applicant sees only the outcome and the reason you choose — never screening details.
                </p>
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  )
}

function reviewStages(d: KycDetail): readonly { readonly name: string; readonly detail: string; readonly tone: 'success' | 'warning' | 'danger' | 'neutral' }[] {
  const check = (name: string) => d.checks.find((c) => c.name.startsWith(name))
  const identity = check('Identity numbers')
  const vendor = check('KYC vendor')
  const background = check('Background')
  const documents = check('Documents')

  const tone = (outcome: string | undefined): 'success' | 'warning' | 'danger' | 'neutral' =>
    outcome === 'pass' ? 'success' : outcome === 'fail' ? 'danger' : outcome === 'review' ? 'warning' : 'neutral'

  return [
    { name: 'Identity & liveness', detail: identity?.outcome === 'pass' ? 'Passed' : 'Awaiting the driver', tone: tone(identity?.outcome) },
    { name: 'Document authenticity', detail: documents?.outcome === 'pass' ? 'Passed' : documents?.outcome === 'fail' ? 'A document has expired' : 'Awaiting your decision', tone: tone(documents?.outcome) },
    { name: 'Screening', detail: vendor?.outcome === 'pass' ? 'Clear' : vendor?.outcome === 'fail' ? 'Failed' : 'Manual review', tone: tone(vendor?.outcome) },
    { name: 'Background check', detail: background?.outcome === 'pass' ? 'Cleared' : 'Queued · vendor SLA 24 h', tone: tone(background?.outcome) },
    { name: 'Decision', detail: d.kycStatus === 'Approved' ? `Approved by ${d.approvedBy ?? 'reviewer'}` : d.kycStatus === 'Rejected' ? `Rejected by ${d.rejectedBy ?? 'reviewer'}` : 'Awaiting your decision', tone: d.kycStatus === 'Approved' ? 'success' : d.kycStatus === 'Rejected' ? 'danger' : 'warning' },
  ]
}

function statusLabel(d: KycDetail): string {
  return d.kycStatus === 'Approved' ? `approved ${new Date(d.updatedAt).toLocaleDateString('en-NG')}` : `rejected ${new Date(d.updatedAt).toLocaleDateString('en-NG')}`
}

function initials(name: string): string {
  return name.split(/\s+/).filter((p) => p.length > 0).slice(0, 2).map((p) => p.charAt(0).toUpperCase()).join('') || '?'
}

function Row({ label, value, tone = 'neutral', mono = false }: { readonly label: string; readonly value: string; readonly tone?: 'neutral' | 'success' | 'warning' | 'danger'; readonly mono?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-line-subtle py-2 last:border-0">
      <dt className="text-[13px] text-fg-secondary">{label}</dt>
      <dd className={cn('text-right text-[13px] font-medium', mono && 'tabular', tone === 'success' && 'text-fg-success', tone === 'warning' && 'text-fg-warning', tone === 'danger' && 'text-fg-danger')}>{value}</dd>
    </div>
  )
}
