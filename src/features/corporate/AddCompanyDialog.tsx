import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { useState } from 'react'

import { Button } from '../../components/ui/Button'
import { Dialog } from '../../components/ui/Dialog'
import { Checkbox, Field, Notice, PrefixedInput, Select, TextInput } from '../../components/ui/Inputs'
import { ApiError } from '../../lib/api/problem'
import { type NewCompany, corporateApi, corporateKeys } from './api'

/**
 * "Add company": creates the account and sends whoever completes setup their link.
 *
 * Mirrors the Figma dialog field for field. The commercial terms are collected here rather
 * than in the wizard because they are ours to set, not the customer's — a deviation from
 * the standard rate is a sales decision, and the person entering it works here.
 */
export function AddCompanyDialog({ open, onClose }: { readonly open: boolean; readonly onClose: () => void }) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const [name, setName] = useState('')
  const [rc, setRc] = useState('')
  const [manager, setManager] = useState('')
  const [managerEmail, setManagerEmail] = useState('')
  const [seats, setSeats] = useState('')
  const [contract, setContract] = useState<'annual' | 'monthly'>('annual')
  const [setupName, setSetupName] = useState('')
  const [setupEmail, setSetupEmail] = useState('')
  const [commission, setCommission] = useState('20')
  const [terms, setTerms] = useState<NewCompany['paymentTerms']>('invoice_net_30')
  const [creditLimit, setCreditLimit] = useState('5000000')
  const [sendNow, setSendNow] = useState(true)

  const create = useMutation({
    mutationFn: (body: NewCompany) => corporateApi.create(body),
    onSuccess: (detail) => {
      void queryClient.invalidateQueries({ queryKey: corporateKeys.all })
      onClose()
      void navigate({ to: '/corporate/$companyId', params: { companyId: detail.summary.companyId } })
    },
  })

  const [seatsMin, seatsMax] = parseSeats(seats)
  const commissionRate = Number.parseFloat(commission) / 100
  const canSubmit = name.trim().length > 1 && rc.trim().length > 4 && setupName.trim().length > 1 && setupEmail.includes('@') && Number.isFinite(commissionRate)

  function submit() {
    create.mutate({
      name: name.trim(),
      rcNumber: rc.trim(),
      ...(manager.trim().length > 0 ? { accountManagerName: manager.trim() } : {}),
      ...(managerEmail.trim().length > 0 ? { accountManagerEmail: managerEmail.trim() } : {}),
      ...(seatsMin !== undefined ? { expectedSeatsMin: seatsMin } : {}),
      ...(seatsMax !== undefined ? { expectedSeatsMax: seatsMax } : {}),
      contractTerm: contract,
      setupName: setupName.trim(),
      setupEmail: setupEmail.trim().toLowerCase(),
      commissionRate,
      paymentTerms: terms,
      ...(creditLimit.trim().length > 0 ? { creditLimitMinor: Math.round(Number.parseFloat(creditLimit.replace(/,/g, '')) * 100) } : {}),
      sendLinkNow: sendNow,
    })
  }

  const error = create.error instanceof ApiError ? create.error.message : create.error instanceof Error ? create.error.message : null

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Add company"
      subtitle="Creates the account and sends the onboarding link. The company completes verification themselves."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} loading={create.isPending} disabled={!canSubmit}>
            {sendNow ? 'Create and send link' : 'Create as draft'}
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-[1fr_180px]">
        <Field label="Registered company name" htmlFor="co-name">
          <TextInput id="co-name" value={name} onChange={(e) => { setName(e.target.value) }} placeholder="Vantage Foods Ltd" autoFocus />
        </Field>
        <Field label="RC number" htmlFor="co-rc" hint="Verified against CAC">
          <TextInput id="co-rc" value={rc} onChange={(e) => { setRc(e.target.value) }} placeholder="RC-1509882" />
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Account manager" htmlFor="co-manager">
          <TextInput id="co-manager" value={manager} onChange={(e) => { setManager(e.target.value) }} placeholder="Nkechi Obi" />
        </Field>
        <Field label="Expected seats" htmlFor="co-seats">
          <TextInput id="co-seats" value={seats} onChange={(e) => { setSeats(e.target.value) }} placeholder="120 – 250" />
        </Field>
        <Field label="Contract" htmlFor="co-contract" hint={contract === 'annual' ? 'Renews yearly' : 'Renews monthly'}>
          <Select id="co-contract" value={contract} onChange={(e) => { setContract(e.target.value as 'annual' | 'monthly') }}>
            <option value="annual">Annual</option>
            <option value="monthly">Monthly</option>
          </Select>
        </Field>
      </div>

      <Field label="Account manager email" htmlFor="co-manager-email" hint="Replies to the onboarding email land here.">
        <TextInput id="co-manager-email" type="email" value={managerEmail} onChange={(e) => { setManagerEmail(e.target.value) }} placeholder="nkechi.o@orbit.ng" />
      </Field>

      <p className="pt-1 text-[13px] font-semibold">Who completes setup</p>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Full name" htmlFor="co-setup-name">
          <TextInput id="co-setup-name" value={setupName} onChange={(e) => { setSetupName(e.target.value) }} placeholder="Adaeze Nnamdi" />
        </Field>
        <Field label="Work email" htmlFor="co-setup-email">
          <TextInput id="co-setup-email" type="email" value={setupEmail} onChange={(e) => { setSetupEmail(e.target.value) }} placeholder="adaeze.n@vantagefoods.ng" />
        </Field>
      </div>

      <p className="pt-1 text-[13px] font-semibold">Commercial terms</p>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Commission" htmlFor="co-commission" hint="Deviations need Head of Sales">
          <div className="relative">
            <TextInput id="co-commission" inputMode="decimal" value={commission} onChange={(e) => { setCommission(e.target.value) }} className="pr-14" />
            <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-[13px] text-fg-tertiary">% flat</span>
          </div>
        </Field>
        <Field label="Payment terms" htmlFor="co-terms">
          <Select id="co-terms" value={terms} onChange={(e) => { setTerms(e.target.value as NewCompany['paymentTerms']) }}>
            <option value="invoice_net_30">Net 30</option>
            <option value="invoice_net_7">Net 7</option>
            <option value="card_on_file">Card on file</option>
          </Select>
        </Field>
        <Field label="Credit limit" htmlFor="co-credit">
          <PrefixedInput id="co-credit" prefix="₦" inputMode="numeric" value={creditLimit} onChange={(e) => { setCreditLimit(e.target.value) }} />
        </Field>
      </div>

      <Checkbox
        checked={sendNow}
        onChange={setSendNow}
        label="Send the onboarding link now"
        description="They receive an email and can start immediately. Otherwise it stays a draft."
      />

      <Notice tone="info">
        You cannot skip verification for them. Booking stays locked until CAC and TIN are matched, whoever creates the account.
      </Notice>

      {error !== null && <Notice tone="danger">{error}</Notice>}
    </Dialog>
  )
}

function parseSeats(text: string): [number | undefined, number | undefined] {
  const numbers = text.match(/\d+/g)?.map(Number) ?? []

  if (numbers.length === 0) {
    return [undefined, undefined]
  }

  return [numbers[0], numbers[1] ?? numbers[0]]
}
