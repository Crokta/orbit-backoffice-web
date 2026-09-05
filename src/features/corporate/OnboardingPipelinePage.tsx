import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate } from '@tanstack/react-router'
import { useState } from 'react'

import { Button } from '../../components/ui/Button'
import { Dialog } from '../../components/ui/Dialog'
import { Field, Notice, TextInput } from '../../components/ui/Inputs'
import { LoadError } from '../../components/ui/LoadError'
import { cn } from '../../components/ui/cn'
import { Chips } from '../shared/ListControls'
import { AddCompanyDialog } from './AddCompanyDialog'
import { type OnboardingCard, type OnboardingStage, STAGE_LABEL, corporateApi, corporateKeys } from './api'

const FILTERS = [
  { value: 'all', label: 'All stages' },
  { value: 'blocked', label: 'Blocked' },
  { value: 'waiting_on_us', label: 'Waiting on us' },
  { value: 'waiting_on_customer', label: 'Waiting on customer' },
] as const

type Filter = (typeof FILTERS)[number]['value']

const STAGES: readonly { readonly stage: OnboardingStage; readonly owner: 'Orbit' | 'Customer' | 'Both'; readonly requires: string }[] = [
  { stage: 'signed', owner: 'Orbit', requires: 'Contract countersigned, account manager assigned, link sent' },
  { stage: 'kyb_review', owner: 'Orbit', requires: 'CAC certificate, TIN, directors verified against CAC registry' },
  { stage: 'billing_setup', owner: 'Customer', requires: 'Payment terms agreed, billing contact and PO number captured' },
  { stage: 'employee_import', owner: 'Customer', requires: 'CSV or invitations, cost centres mapped, seats confirmed' },
  { stage: 'policy_go_live', owner: 'Both', requires: 'Travel policy set, admins trained, first ride booked' },
]

/**
 * Where every signed company is on its way to live.
 *
 * A board rather than a list because the question is "what is stuck, and whose move is
 * it", and a card under a column answers that before anyone reads a word.
 */
export function OnboardingPipelinePage() {
  const [filter, setFilter] = useState<Filter>('all')
  const [adding, setAdding] = useState(false)
  const [assigning, setAssigning] = useState<OnboardingCard | null>(null)

  const board = useQuery({ queryKey: corporateKeys.pipeline(filter), queryFn: () => corporateApi.pipeline(filter), refetchInterval: 60_000 })
  const cards = board.data?.cards ?? []

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-[22px] font-semibold leading-[28px]">Onboarding pipeline</h1>
          <p className="mt-0.5 text-[13px] text-fg-secondary">
            {board.data === undefined
              ? 'Loading…'
              : `${String(cards.length)} companies onboarding · median time to live ${String(board.data.medianDaysToLive)} days · target ${String(board.data.targetDays)}`}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Link to="/corporate" className="text-[13px] font-medium text-fg-brand hover:underline">← Corporate customers</Link>
          <Button onClick={() => { setAdding(true) }}>Add company</Button>
        </div>
      </header>

      <div className="flex flex-wrap items-center gap-3">
        <Chips label="Filter" value={filter} options={FILTERS} onChange={setFilter} />
        <span className="tabular text-[11px] text-fg-tertiary">SLA: live within {board.data?.targetDays ?? 14} days of signature</span>
      </div>

      {board.isError ? (
        <LoadError error={board.error} what="the pipeline" onRetry={() => { void board.refetch() }} />
      ) : (
        <div className="grid gap-3 lg:grid-cols-5">
          {STAGES.map(({ stage }) => {
            const inStage = cards.filter((card) => card.onboarding.stage === stage)

            return (
              <section key={stage} className="flex min-h-[420px] flex-col rounded-xl border border-line-subtle bg-surface-sunken p-3">
                <header className="mb-2 flex items-center justify-between px-1">
                  <h2 className="text-[13px] font-semibold">{STAGE_LABEL[stage]}</h2>
                  <span className="tabular text-[12px] text-fg-tertiary">{inStage.length}</span>
                </header>

                {board.isPending ? (
                  <p className="px-1 text-[12px] text-fg-tertiary">Loading…</p>
                ) : inStage.length === 0 ? (
                  <p className="mt-6 text-center text-[12px] text-fg-tertiary">Nothing here</p>
                ) : (
                  <ul className="space-y-2">
                    {inStage.map((card) => (
                      <Card key={card.company.companyId} card={card} onAssign={() => { setAssigning(card) }} />
                    ))}
                  </ul>
                )}
              </section>
            )
          })}
        </div>
      )}

      <section className="rounded-xl border border-line-subtle bg-surface p-4">
        <h2 className="text-[15px] font-semibold">What each stage requires</h2>
        <div className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {STAGES.map(({ stage, owner, requires }) => (
            <div key={stage}>
              <p className="text-[13px] font-medium">{STAGE_LABEL[stage]}</p>
              <span
                className={cn(
                  'mt-1 inline-flex rounded-[4px] px-1.5 py-0.5 text-[11px] font-semibold',
                  owner === 'Orbit' ? 'bg-brand-subtle text-fg-brand' : owner === 'Customer' ? 'bg-subtle text-fg-secondary' : 'bg-success-subtle text-fg-success',
                )}
              >
                {owner}
              </span>
              <p className="mt-1 text-[12px] text-fg-tertiary">{requires}</p>
            </div>
          ))}
        </div>
      </section>

      <AddCompanyDialog open={adding} onClose={() => { setAdding(false) }} />
      <AssignManagerDialog card={assigning} onClose={() => { setAssigning(null) }} />
    </div>
  )
}

function Card({ card, onAssign }: { readonly card: OnboardingCard; readonly onAssign: () => void }) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { company, onboarding } = card
  const blocked = onboarding.blockedReason !== null
  const critical = blocked && (company.accountManagerName === null || card.daysSinceSigned > 10)

  const resend = useMutation({
    mutationFn: () => corporateApi.resendLink(company.companyId),
    onSuccess: () => { void queryClient.invalidateQueries({ queryKey: corporateKeys.all }) },
  })

  return (
    <li
      className={cn(
        'rounded-lg border bg-surface p-3',
        critical ? 'border-[color:var(--bg-danger)]' : 'border-line-subtle',
      )}
    >
      <button
        type="button"
        onClick={() => { void navigate({ to: '/corporate/$companyId', params: { companyId: company.companyId } }) }}
        className="block w-full text-left"
      >
        <p className="text-[13px] font-semibold">{company.name}</p>
        <p className="mt-0.5 text-[12px] text-fg-tertiary">{card.headline}</p>

        {blocked ? (
          <>
            <span
              className={cn(
                'mt-2 inline-flex rounded-[4px] px-1.5 py-0.5 text-[11px] font-semibold',
                critical ? 'bg-danger-subtle text-fg-danger' : 'bg-warning-subtle text-fg-warning',
              )}
            >
              Blocked · {card.daysInStage}d
            </span>
            <p className={cn('mt-1.5 text-[12px]', critical ? 'text-fg-danger' : 'text-fg-warning')}>{onboarding.blockedReason}</p>
          </>
        ) : (
          <span className="mt-2 inline-flex rounded-[4px] bg-subtle px-1.5 py-0.5 text-[11px] font-semibold text-fg-secondary">
            {onboarding.waitingOn === 'orbit' ? 'Waiting on us' : onboarding.waitingOn === 'customer' ? 'Waiting on customer' : 'In progress'} · {card.daysInStage}d
          </span>
        )}

        <p className={cn('mt-2 text-[12px]', company.accountManagerName === null ? 'text-fg-warning' : 'text-fg-tertiary')}>
          {company.accountManagerName ?? 'Unassigned'}
        </p>
      </button>

      <div className="mt-2 flex flex-wrap gap-1.5 border-t border-line-subtle pt-2">
        <Button variant="ghost" size="sm" onClick={onAssign}>{company.accountManagerName === null ? 'Assign' : 'Reassign'}</Button>
        {onboarding.stage === 'kyb_review' && onboarding.waitingOn === 'orbit' && (
          <Button variant="secondary" size="sm" onClick={() => { void navigate({ to: '/corporate/$companyId', params: { companyId: company.companyId } }) }}>
            Review
          </Button>
        )}
        {(onboarding.stage === 'signed' || company.status === 'draft') && (
          <Button variant="ghost" size="sm" loading={resend.isPending} onClick={() => { resend.mutate() }}>
            {company.status === 'draft' ? 'Send link' : 'Re-send link'}
          </Button>
        )}
      </div>
    </li>
  )
}

/** Names the account manager. Small enough to live here rather than on its own file. */
export function AssignManagerDialog({ card, onClose }: { readonly card: OnboardingCard | null; readonly onClose: () => void }) {
  const queryClient = useQueryClient()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')

  const assign = useMutation({
    mutationFn: () => corporateApi.assignManager(card?.company.companyId ?? '', { name: name.trim(), ...(email.trim().length > 0 ? { email: email.trim() } : {}) }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: corporateKeys.all })
      setName('')
      setEmail('')
      onClose()
    },
  })

  return (
    <Dialog
      open={card !== null}
      onClose={onClose}
      title={card === null ? 'Assign account manager' : `Account manager for ${card.company.name}`}
      subtitle="Recorded on the account timeline and in the audit log."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={() => { assign.mutate() }} loading={assign.isPending} disabled={name.trim().length < 2}>Assign</Button>
        </>
      }
    >
      <Field label="Name" htmlFor="am-name">
        <TextInput id="am-name" value={name} onChange={(e) => { setName(e.target.value) }} placeholder="Nkechi Obi" autoFocus />
      </Field>
      <Field label="Email" htmlFor="am-email" hint="Replies to the company's onboarding email land here.">
        <TextInput id="am-email" type="email" value={email} onChange={(e) => { setEmail(e.target.value) }} placeholder="nkechi.o@orbit.ng" />
      </Field>
      {assign.isError && <Notice tone="danger">{assign.error.message}</Notice>}
    </Dialog>
  )
}
