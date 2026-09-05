import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useParams } from '@tanstack/react-router'
import { useState } from 'react'

import { Button } from '../../components/ui/Button'
import { Dialog } from '../../components/ui/Dialog'
import { Checkbox, Field, Notice, Select, TextArea } from '../../components/ui/Inputs'
import { LoadError } from '../../components/ui/LoadError'
import { Money } from '../../components/ui/Money'
import { cn } from '../../components/ui/cn'
import { AssignManagerDialog } from './OnboardingPipelinePage'
import { Initials, Panel, Row, StatTile, StatusBadge } from './CorporateWidgets'
import {
  type CorporateDetail,
  DOCUMENT_LABEL,
  PAYMENT_TERMS_LABEL,
  STAGE_LABEL,
  compactMoney,
  corporateApi,
  corporateKeys,
  daysAgo,
  shortDate,
} from './api'

/**
 * One corporate account: the relationship, its health, and what the account manager can do.
 *
 * Lays out the way the design does — the money across the top, the legal entity and the
 * people on the left, health and the timeline on the right — with the alert that matters
 * most (overdue, at risk, a verification waiting on us) as the first thing on the page.
 */
export function CorporateAccountPage() {
  const { companyId } = useParams({ from: '/authenticated/corporate/$companyId' })
  const queryClient = useQueryClient()

  const detail = useQuery({ queryKey: corporateKeys.detail(companyId), queryFn: () => corporateApi.get(companyId) })

  const [noting, setNoting] = useState(false)
  const [statusChange, setStatusChange] = useState<'at_risk' | 'churned' | 'live' | null>(null)
  const [assigning, setAssigning] = useState(false)

  const refresh = () => { void queryClient.invalidateQueries({ queryKey: corporateKeys.all }) }

  const chase = useMutation({ mutationFn: () => corporateApi.chase(companyId), onSuccess: refresh })
  const resend = useMutation({ mutationFn: () => corporateApi.resendLink(companyId), onSuccess: refresh })

  if (detail.isError) {
    return <LoadError error={detail.error} what="this account" onRetry={() => { void detail.refetch() }} />
  }

  if (detail.isPending) {
    return <p className="text-[13px] text-fg-tertiary">Loading…</p>
  }

  const d = detail.data
  const s = d.summary
  const overdue = s.invoiceStatus === 'overdue'
  const onboarding = s.status === 'onboarding' || s.status === 'draft'
  const spendDelta = d.spendPrevious30dMinor === 0 ? null : (100 * (s.spend30dMinor - d.spendPrevious30dMinor)) / d.spendPrevious30dMinor
  const ridesDelta = d.ridesPrevious30d === 0 ? null : (100 * (s.rides30d - d.ridesPrevious30d)) / d.ridesPrevious30d

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-[12px]"><Link to="/corporate" className="text-fg-brand hover:underline">Corporate customers</Link></p>
          <h1 className="text-[22px] font-semibold leading-[28px]">{d.legalName}</h1>
          <p className="mt-0.5 flex flex-wrap items-center gap-2 text-[13px] text-fg-secondary">
            <StatusBadge status={s.status} />
            <span className="tabular">{s.rcNumber ?? s.companyId}</span>
            <span>·</span>
            <span>{onboarding ? `${STAGE_LABEL[s.stage]} · signed ${shortDate(s.signedAt)}` : `live since ${shortDate(s.liveAt)}`}</span>
            <span>·</span>
            <span>account manager {s.accountManagerName ?? <span className="text-fg-warning">unassigned</span>}</span>
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => { setAssigning(true) }}>{s.accountManagerName === null ? 'Assign manager' : 'Reassign'}</Button>
          {onboarding && (
            <Button variant="secondary" size="sm" loading={resend.isPending} onClick={() => { resend.mutate() }}>
              {d.onboardingLinkSentAt === null ? 'Send onboarding link' : 'Re-send link'}
            </Button>
          )}
          {!onboarding && s.status !== 'churned' && (
            <Select
              aria-label="Change status"
              value=""
              onChange={(e) => { if (e.target.value !== '') setStatusChange(e.target.value as 'at_risk' | 'churned' | 'live') }}
              className="h-8 w-auto text-[13px]"
            >
              <option value="">Status…</option>
              {s.status === 'at_risk' && <option value="live">Back to live</option>}
              {s.status === 'live' && <option value="at_risk">Mark at risk</option>}
              <option value="churned">Mark churned</option>
            </Select>
          )}
          <Button variant="secondary" size="sm" onClick={() => { setNoting(true) }}>Log a note</Button>
        </div>
      </header>

      {overdue && s.latestInvoiceId !== null && (
        <Notice
          tone="danger"
          title={`${s.latestInvoiceId} is ${String(s.invoiceOverdueDays)} days overdue`}
          action={<Button variant="danger" size="sm" loading={chase.isPending} onClick={() => { chase.mutate() }}>Chase payment</Button>}
        >
          {s.attention ?? 'Travel suspends 14 days after the due date.'} Reminders go to {d.billingEmail ?? d.setupEmail ?? 'the setup contact'}.
          {chase.isError && <span className="ml-2 font-medium">{chase.error.message}</span>}
          {chase.isSuccess && <span className="ml-2 font-medium">Reminder sent.</span>}
        </Notice>
      )}

      {s.status === 'at_risk' && !overdue && (
        <Notice tone="warning" title="Flagged at risk">{s.attention}</Notice>
      )}

      {onboarding && (
        <Notice
          tone={d.onboarding.blockedReason === null ? 'info' : 'warning'}
          title={`Onboarding · ${STAGE_LABEL[s.stage]} · ${d.onboarding.waitingOn === 'orbit' ? 'waiting on us' : d.onboarding.waitingOn === 'customer' ? 'waiting on the customer' : 'both sides'}`}
        >
          {d.onboarding.blockedReason ?? `Link ${d.onboardingLinkSentAt === null ? 'not yet sent' : `sent ${shortDate(d.onboardingLinkSentAt)}`} to ${d.setupEmail ?? '—'}.`}
          {resend.isSuccess && <span className="ml-2 font-medium">Link re-sent.</span>}
        </Notice>
      )}

      {d.verification.status === 'submitted' && <VerificationReview companyId={companyId} detail={d} onDone={refresh} />}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <StatTile
          label="Spend (30d)"
          value={compactMoney(s.spend30dMinor, s.currency)}
          delta={spendDelta === null ? undefined : `${Math.abs(spendDelta).toFixed(1)}%`}
          deltaTone={spendDelta === null ? 'neutral' : spendDelta >= 0 ? 'up' : 'down'}
          note="vs previous 30 days"
        />
        <StatTile
          label="Rides (30d)"
          value={s.rides30d.toLocaleString('en-NG')}
          delta={ridesDelta === null ? undefined : `${Math.abs(ridesDelta).toFixed(1)}%`}
          deltaTone={ridesDelta === null ? 'neutral' : ridesDelta >= 0 ? 'up' : 'down'}
          note="vs previous 30 days"
        />
        <StatTile label="Seats billed" value={s.seats} delta={String(s.activeSeats)} deltaTone="up" note="active" />
        <StatTile label="Seats unused" value={s.neverTravelled} deltaTone={s.neverTravelled > 0 ? 'warning' : 'neutral'} delta={s.neverTravelled > 0 ? 'no ride in 30 days' : undefined} />
        <StatTile label="Avg cost per ride" value={compactMoney(d.averageFare30dMinor, s.currency)} note={`${(100 * s.commissionRate).toFixed(0)}% commission`} />
      </div>

      <div className="grid gap-4 xl:grid-cols-[1fr_380px]">
        <div className="space-y-4">
          <Panel title="Account">
            <dl>
              <Row label="Legal name" value={d.legalName} />
              <Row label="RC number" value={s.rcNumber ?? '—'} mono />
              <Row label="TIN" value={d.tin ?? '—'} mono />
              <Row label="Registered address" value={d.registeredAddress ?? '—'} />
              <Row label="Industry" value={d.industry ?? '—'} />
              <Row label="Verified domain" value={d.verifiedDomain === null ? 'Any address' : `@${d.verifiedDomain}`} mono />
              <Row label="Contract" value={`${d.contractTerm === 'annual' ? 'Annual' : 'Monthly'} · renews ${shortDate(d.contractRenewsAt)}`} />
              <Row label="Commission" value={`${(100 * s.commissionRate).toFixed(0)}% flat`} />
              <Row label="Payment terms" value={PAYMENT_TERMS_LABEL[d.paymentTerms]} />
              <Row label="Credit limit" value={d.creditLimitMinor === null ? '—' : <Money minorUnits={d.creditLimitMinor} currency={s.currency} />} tone="warning" mono />
              <Row label="Billing contact" value={d.billingEmail === null ? '—' : `${d.billingContactName ?? ''} · ${d.billingEmail}${d.poNumber === null ? '' : ` · ${d.poNumber}`}`} />
              {d.expectedSeatsMin !== null && <Row label="Expected seats" value={`${String(d.expectedSeatsMin)} – ${String(d.expectedSeatsMax ?? d.expectedSeatsMin)}`} />}
            </dl>
          </Panel>

          <Panel title="Contacts" subtitle="Owners and admins on the company account">
            {d.contacts.length === 0 ? (
              <p className="text-[13px] text-fg-tertiary">Nobody has an admin role yet{d.setupEmail === null ? '.' : ` — the onboarding link went to ${d.setupEmail}.`}</p>
            ) : (
              <ul className="divide-y divide-line-subtle">
                {d.contacts.map((contact) => (
                  <li key={contact.employeeId} className="flex items-center gap-3 py-2.5">
                    <Initials name={contact.name ?? contact.email} />
                    <div className="min-w-0 flex-1">
                      <p className="text-[13px] font-medium">{contact.name ?? contact.email}</p>
                      <p className={cn('text-[12px]', contact.status === 'Invited' ? 'text-fg-warning' : 'text-fg-tertiary')}>
                        {roleLabel(contact.role)}{contact.isApprover ? ' · approver' : ''}{contact.status === 'Invited' ? ' · not signed in yet' : ''}
                      </p>
                    </div>
                    <span className="tabular text-[12px] text-fg-brand">{contact.email}</span>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel title="Verification" subtitle={verificationSubtitle(d)}>
            <DocumentList companyId={companyId} detail={d} />
          </Panel>
        </div>

        <div className="space-y-4">
          <Panel title="Account health" subtitle="Reviewed weekly by the account manager">
            <dl>
              <Row label="Seat utilisation" value={`${String(d.health.seatUtilisationPct)}% · ${String(d.health.activeSeats)} of ${String(d.health.seats)}`} tone={d.health.seatUtilisationPct >= 70 ? 'success' : 'warning'} mono />
              <Row label="Rides per active seat" value={`${d.health.ridesPerActiveSeat.toFixed(1)} / month`} tone={d.health.ridesPerActiveSeat >= 4 ? 'success' : 'warning'} mono />
              <Row label="Policy breaches" value={`${String(d.health.policyBreaches30d)} in 30 days`} tone={d.health.policyBreaches30d > 5 ? 'warning' : 'neutral'} mono />
              <Row label="Payment history" value={`${String(d.health.invoicesOnTime)} on time, ${String(d.health.invoicesLate)} late`} tone={d.health.invoicesLate > 0 ? 'warning' : 'success'} />
              <Row label="Renewal risk" value={capitalise(d.health.renewalRisk)} tone={d.health.renewalRisk.startsWith('high') ? 'danger' : d.health.renewalRisk.startsWith('medium') ? 'warning' : 'success'} />
            </dl>
          </Panel>

          <Panel title="Account timeline">
            {d.timeline.length === 0 ? (
              <p className="text-[13px] text-fg-tertiary">Nothing recorded yet.</p>
            ) : (
              <ol className="relative ml-2 space-y-4 border-l border-line-subtle pl-5">
                {d.timeline.map((entry) => (
                  <li key={entry.entryId} className="relative">
                    <span
                      aria-hidden
                      className={cn(
                        'absolute -left-[26px] top-1 size-3 rounded-full border-2 border-surface',
                        entry.tone === 'success' ? 'bg-success' : entry.tone === 'warning' ? 'bg-warning' : entry.tone === 'danger' ? 'bg-danger' : 'bg-brand',
                      )}
                    />
                    <p className="text-[13px] font-medium">{entry.title}</p>
                    <p className="tabular text-[11px] text-fg-tertiary">
                      {entry.detail !== null && <>{entry.detail} · </>}
                      {shortDate(entry.at)} · {entry.actor}
                    </p>
                  </li>
                ))}
              </ol>
            )}
          </Panel>
        </div>
      </div>

      <NoteDialog companyId={companyId} open={noting} onClose={() => { setNoting(false) }} onDone={refresh} />
      <StatusDialog companyId={companyId} status={statusChange} onClose={() => { setStatusChange(null) }} onDone={refresh} />
      <AssignManagerDialog
        card={assigning ? { company: s, onboarding: d.onboarding, daysInStage: 0, daysSinceSigned: daysAgo(s.signedAt) ?? 0, headline: '' } : null}
        onClose={() => { setAssigning(false) }}
      />
    </div>
  )
}

function verificationSubtitle(d: CorporateDetail): string {
  switch (d.verification.status) {
    case 'verified':
      return `Approved ${shortDate(d.verification.decidedAt)} by ${d.verification.decidedBy ?? 'compliance'} · CAC and TIN matched`
    case 'submitted':
      return `Submitted ${shortDate(d.verification.submittedAt)} · awaiting a reviewer`
    case 'rejected':
      return `Sent back ${shortDate(d.verification.decidedAt)}: ${d.verification.rejectionReason ?? ''}`
    case 'in_progress':
      return 'Documents arriving'
    default:
      return 'Not started'
  }
}

function DocumentList({ companyId, detail }: { readonly companyId: string; readonly detail: CorporateDetail }) {
  const [error, setError] = useState<string | null>(null)

  if (detail.verification.documents.length === 0) {
    return <p className="text-[13px] text-fg-tertiary">No documents uploaded yet.</p>
  }

  return (
    <>
      <ul className="divide-y divide-line-subtle">
        {detail.verification.documents.map((doc) => (
          <li key={doc.documentId} className="flex items-center gap-3 py-2.5">
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-medium">{DOCUMENT_LABEL[doc.type]}</p>
              <p className="tabular text-[11px] text-fg-tertiary">{doc.fileName} · {(doc.sizeBytes / 1024).toFixed(0)} KB · {shortDate(doc.uploadedAt)}</p>
              {doc.note !== null && <p className="text-[12px] text-fg-danger">{doc.note}</p>}
            </div>
            <span
              className={cn(
                'inline-flex rounded-[4px] px-1.5 py-0.5 text-[11px] font-semibold',
                doc.status === 'accepted' ? 'bg-success-subtle text-fg-success' : doc.status === 'rejected' ? 'bg-danger-subtle text-fg-danger' : 'bg-warning-subtle text-fg-warning',
              )}
            >
              {doc.status === 'accepted' ? 'Accepted' : doc.status === 'rejected' ? 'Rejected' : 'Received'}
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => { corporateApi.openDocument(companyId, doc.documentId).catch((failure: unknown) => { setError(failure instanceof Error ? failure.message : 'Could not open the document.') }) }}
            >
              Open
            </Button>
          </li>
        ))}
      </ul>
      {error !== null && <p role="alert" className="mt-2 text-[12px] text-fg-danger">{error}</p>}
    </>
  )
}

/**
 * The compliance decision: approve, or send back with a reason and the documents to redo.
 *
 * Only drawn while a submission is waiting. The reason is mandatory on rejection because
 * the company reads it verbatim; "rejected" with no reason is a support ticket.
 */
function VerificationReview({ companyId, detail, onDone }: { readonly companyId: string; readonly detail: CorporateDetail; readonly onDone: () => void }) {
  const [note, setNote] = useState('')
  const [rejected, setRejected] = useState<readonly string[]>([])

  const decide = useMutation({
    mutationFn: (approved: boolean) => corporateApi.decide(companyId, { approved, reason: note.trim(), rejectedDocumentIds: rejected }),
    onSuccess: onDone,
  })

  return (
    <section className="rounded-xl border border-[color:var(--bg-brand)] bg-surface p-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-[15px] font-semibold">Verification waiting on you</h2>
          <p className="text-[12px] text-fg-tertiary">
            Submitted {shortDate(detail.verification.submittedAt)} · {detail.verification.signatoryConfirmed ? 'signatory confirmed against CAC directors' : 'signatory not confirmed'} ·
            we promise a decision within one working day.
          </p>
        </div>
      </div>

      <div className="mt-3 grid gap-4 lg:grid-cols-[1fr_320px]">
        <div className="space-y-2">
          <p className="text-[12px] font-medium text-fg-secondary">Tick anything that needs re-uploading</p>
          {detail.verification.documents.map((doc) => (
            <Checkbox
              key={doc.documentId}
              checked={rejected.includes(doc.documentId)}
              onChange={(checked) => { setRejected(checked ? [...rejected, doc.documentId] : rejected.filter((id) => id !== doc.documentId)) }}
              label={DOCUMENT_LABEL[doc.type]}
              description={`${doc.fileName} · ${(doc.sizeBytes / 1024).toFixed(0)} KB`}
            />
          ))}
        </div>

        <div className="space-y-3">
          <Field label="Reviewer note" htmlFor="kyb-note" hint="Required on rejection. The company reads it verbatim.">
            <TextArea id="kyb-note" value={note} onChange={(e) => { setNote(e.target.value) }} placeholder="CAC certificate is a photo of a screen — upload the scan." />
          </Field>
          <div className="flex gap-2">
            <Button className="flex-1" loading={decide.isPending && decide.variables} onClick={() => { decide.mutate(true) }}>Approve</Button>
            <Button variant="danger" className="flex-1" loading={decide.isPending && !decide.variables} disabled={note.trim().length < 10} onClick={() => { decide.mutate(false) }}>Reject</Button>
          </div>
          {decide.isError && <p role="alert" className="text-[12px] text-fg-danger">{decide.error.message}</p>}
          <p className="text-[11px] text-fg-tertiary">Approval opens booking for the company. Rejection sends them back to the documents step with your note.</p>
        </div>
      </div>
    </section>
  )
}

function NoteDialog({ companyId, open, onClose, onDone }: { readonly companyId: string; readonly open: boolean; readonly onClose: () => void; readonly onDone: () => void }) {
  const [note, setNote] = useState('')

  const log = useMutation({
    mutationFn: () => corporateApi.note(companyId, note.trim()),
    onSuccess: () => { setNote(''); onDone(); onClose() },
  })

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Log a note"
      subtitle="Goes on the account timeline with your name and the time."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={() => { log.mutate() }} loading={log.isPending} disabled={note.trim().length < 3}>Save note</Button>
        </>
      }
    >
      <Field label="Note" htmlFor="note-text">
        <TextArea id="note-text" value={note} onChange={(e) => { setNote(e.target.value) }} placeholder="Called Emeka about INV-2026-08 — promised payment Friday." autoFocus />
      </Field>
      {log.isError && <Notice tone="danger">{log.error.message}</Notice>}
    </Dialog>
  )
}

function StatusDialog({ companyId, status, onClose, onDone }: { readonly companyId: string; readonly status: 'at_risk' | 'churned' | 'live' | null; readonly onClose: () => void; readonly onDone: () => void }) {
  const [reason, setReason] = useState('')

  const change = useMutation({
    mutationFn: () => corporateApi.setStatus(companyId, status ?? 'live', reason.trim()),
    onSuccess: () => { setReason(''); onDone(); onClose() },
  })

  const title = status === 'churned' ? 'Mark as churned' : status === 'at_risk' ? 'Flag at risk' : 'Back to live'

  return (
    <Dialog
      open={status !== null}
      onClose={onClose}
      title={title}
      tone={status === 'churned' ? 'danger' : 'neutral'}
      subtitle={status === 'churned' ? 'Employees lose booking. Invoices and history stay.' : status === 'at_risk' ? 'The account shows on the "needs an account manager" list until it is back to live.' : 'Clears the flag.'}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant={status === 'churned' ? 'danger' : 'primary'} onClick={() => { change.mutate() }} loading={change.isPending} disabled={status !== 'live' && reason.trim().length < 5}>
            {title}
          </Button>
        </>
      }
    >
      <Field label="Why" htmlFor="status-reason" hint="A sentence. It goes on the timeline and in the audit log.">
        <TextArea id="status-reason" value={reason} onChange={(e) => { setReason(e.target.value) }} autoFocus />
      </Field>
      {change.isError && <Notice tone="danger">{change.error.message}</Notice>}
    </Dialog>
  )
}

function roleLabel(role: string): string {
  switch (role) {
    case 'Owner':
      return 'Owner'
    case 'TravelAdmin':
      return 'Travel admin'
    case 'BillingAdmin':
      return 'Billing admin'
    default:
      return role
  }
}

function capitalise(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1)
}
