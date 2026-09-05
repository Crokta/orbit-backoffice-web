import { useQuery } from '@tanstack/react-query'
import { Link, useNavigate } from '@tanstack/react-router'
import { useMemo, useState } from 'react'

import { Button } from '../../components/ui/Button'
import { LoadError } from '../../components/ui/LoadError'
import { Money } from '../../components/ui/Money'
import { cn } from '../../components/ui/cn'
import { useDebounced, usePagedList } from '../../lib/paging'
import { Chips, ExportButton, ListToolbar, Pagination, SearchBox } from '../shared/ListControls'
import { AddCompanyDialog } from './AddCompanyDialog'
import { InvoiceBadge, StatTile, StatusBadge } from './CorporateWidgets'
import { type CompanyStatus, type CorporateListFilters, compactMoney, corporateApi, corporateKeys, monthYear } from './api'

const STATUS_CHIPS = [
  { value: 'all', label: 'All' },
  { value: 'live', label: 'Live' },
  { value: 'onboarding', label: 'Onboarding' },
  { value: 'at_risk', label: 'At risk' },
  { value: 'churned', label: 'Churned' },
] as const satisfies readonly { readonly value: CompanyStatus | 'all'; readonly label: string }[]

/**
 * Corporate customers, from the backoffice's side.
 *
 * Every number here is the enterprise service's, fetched live through the admin BFF's
 * gRPC client. The console holds none of it — what it adds is the operator's name on every
 * action and a row in its own audit log.
 */
export function CorporatePage() {
  const navigate = useNavigate()
  const overview = useQuery({ queryKey: corporateKeys.overview(), queryFn: corporateApi.overview, refetchInterval: 60_000 })

  const [search, setSearch] = useState('')
  const [status, setStatus] = useState<CompanyStatus | 'all'>('all')
  const [adding, setAdding] = useState(false)
  const q = useDebounced(search.trim())

  const filters = useMemo<CorporateListFilters>(() => ({ q: q.length === 0 ? undefined : q, status }), [q, status])

  const list = usePagedList({
    key: corporateKeys.list(),
    filters,
    fetchPage: (params) => corporateApi.list(params),
  })

  const o = overview.data
  const currency = o?.currency ?? 'NGN'

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-[22px] font-semibold leading-[28px]">Corporate customers</h1>
          <p className="mt-0.5 text-[13px] text-fg-secondary">
            {o === undefined
              ? 'Loading…'
              : `${String(o.liveAccounts)} live accounts · ${compactMoney(o.annualisedGrossMinor, currency)} annualised · ${String(o.inOnboarding)} in onboarding`}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Link to="/corporate/pipeline" className="text-[13px] font-medium text-fg-brand hover:underline">
            Onboarding pipeline →
          </Link>
          <Button onClick={() => { setAdding(true) }}>Add company</Button>
        </div>
      </header>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <StatTile
          label="Live accounts"
          value={o?.liveAccounts ?? '—'}
          loading={overview.isPending}
          delta={o === undefined ? undefined : String(o.liveAccountsDelta30d)}
          deltaTone={o !== undefined && o.liveAccountsDelta30d > 0 ? 'up' : 'neutral'}
          note="vs last month"
        />
        <StatTile
          label="Annualised revenue"
          value={o === undefined ? '—' : compactMoney(o.annualisedRevenueMinor, currency)}
          loading={overview.isPending}
          delta={o === undefined || o.annualisedGrossMinor === 0 ? undefined : `${(100 * o.annualisedRevenueMinor / o.annualisedGrossMinor).toFixed(1)}%`}
          deltaTone="up"
          note="of gross bookings"
        />
        <StatTile
          label="Seats billed"
          value={o?.seatsBilled.toLocaleString('en-NG') ?? '—'}
          loading={overview.isPending}
          delta={o === undefined ? undefined : String(o.seatsDelta30d)}
          deltaTone={o !== undefined && o.seatsDelta30d > 0 ? 'up' : 'neutral'}
          note="across all accounts"
        />
        <StatTile
          label="In onboarding"
          value={o?.inOnboarding ?? '—'}
          loading={overview.isPending}
          delta={o === undefined ? undefined : String(o.oldestOnboardingDays)}
          deltaTone="neutral"
          note="days, oldest"
        />
        <StatTile
          label="At risk"
          value={o?.atRisk ?? '—'}
          loading={overview.isPending}
          delta={o === undefined ? undefined : String(o.overdueInvoices)}
          deltaTone={o !== undefined && o.overdueInvoices > 0 ? 'down' : 'neutral'}
          note="overdue invoices"
        />
      </div>

      <section className="space-y-2">
        <ListToolbar actions={<ExportButton path="/v1/admin/corporate/export.csv" query={{ q: filters.q, status: status === 'all' ? undefined : status }} filename="orbit-corporate-accounts.csv" />}>
          <SearchBox value={search} onChange={setSearch} placeholder="Company, RC number or admin email" className="w-80" />
          <Chips label="Filter by status" value={status} options={STATUS_CHIPS} onChange={setStatus} />
        </ListToolbar>

        {list.query.isError ? (
          <LoadError error={list.query.error} what="the corporate list" onRetry={() => { void list.query.refetch() }} />
        ) : (
          <div className="overflow-x-auto rounded-xl border border-line-subtle bg-surface">
            <table className="w-full min-w-[880px] border-collapse text-[13px]">
              <thead>
                <tr className="border-b border-line-subtle">
                  {['Company', 'Account manager', 'Seats', 'Rides (30d)', 'Spend (30d)', 'Invoice', 'Status'].map((header, index) => (
                    <th
                      key={header}
                      scope="col"
                      className={cn(
                        'px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-fg-tertiary',
                        index >= 2 && index <= 4 && 'text-right',
                      )}
                    >
                      {header}
                    </th>
                  ))}
                </tr>
              </thead>

              <tbody>
                {list.query.isPending && (
                  <tr><td colSpan={7} className="px-4 py-8 text-center text-fg-tertiary">Loading…</td></tr>
                )}

                {!list.query.isPending && list.items.length === 0 && (
                  <tr><td colSpan={7} className="px-4 py-8 text-center text-fg-tertiary">No company matches that.</td></tr>
                )}

                {list.items.map((company) => {
                  const flagged = company.invoiceStatus === 'overdue' || company.status === 'at_risk'

                  return (
                    <tr
                      key={company.companyId}
                      onClick={() => { void navigate({ to: '/corporate/$companyId', params: { companyId: company.companyId } }) }}
                      className={cn(
                        'cursor-pointer border-b border-line-subtle last:border-0 hover:bg-hover',
                        flagged && 'bg-danger-subtle/40',
                      )}
                    >
                      <td className="px-4 py-3">
                        <p className="font-medium">{company.name}</p>
                        <p className="tabular text-[11px] text-fg-tertiary">
                          {company.rcNumber ?? company.companyId} · since {monthYear(company.liveAt ?? company.signedAt)}
                        </p>
                      </td>
                      <td className="px-4 py-3 text-fg-secondary">{company.accountManagerName ?? <span className="text-fg-tertiary">Unassigned</span>}</td>
                      <td className="tabular px-4 py-3 text-right">{company.seats.toLocaleString('en-NG')}</td>
                      <td className="tabular px-4 py-3 text-right">{company.rides30d.toLocaleString('en-NG')}</td>
                      <td className="px-4 py-3 text-right"><Money minorUnits={company.spend30dMinor} currency={company.currency} /></td>
                      <td className="px-4 py-3"><InvoiceBadge state={company.invoiceStatus} overdueDays={company.invoiceOverdueDays} /></td>
                      <td className="px-4 py-3"><StatusBadge status={company.status} /></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        <Pagination list={list} />
        <p className="text-[11px] text-fg-tertiary">Spend is gross bookings over the last thirty days; commission is shown on the account.</p>
      </section>

      <section className="rounded-xl border border-line-subtle bg-surface p-4">
        <h2 className="text-[15px] font-semibold">Needs an account manager today</h2>

        {overview.isPending ? (
          <p className="mt-3 text-[13px] text-fg-tertiary">Loading…</p>
        ) : o === undefined || o.needsAttention.length === 0 ? (
          <p className="mt-3 text-[13px] text-fg-tertiary">Nothing is waiting on an account manager.</p>
        ) : (
          <ul className="mt-2 divide-y divide-line-subtle">
            {o.needsAttention.map((company) => (
              <li key={company.companyId}>
                <Link
                  to="/corporate/$companyId"
                  params={{ companyId: company.companyId }}
                  className="flex items-center justify-between gap-4 py-3 hover:bg-hover"
                >
                  <div className="min-w-0">
                    <p className="text-[13px] font-medium">{company.name}</p>
                    <p
                      className={cn(
                        'truncate text-[12px]',
                        company.invoiceStatus === 'overdue' || company.status === 'at_risk' ? 'text-fg-danger' : 'text-fg-warning',
                      )}
                    >
                      {company.attention}
                    </p>
                  </div>
                  <span className={cn('shrink-0 text-[12px]', company.accountManagerName === null ? 'text-fg-warning' : 'text-fg-tertiary')}>
                    {company.accountManagerName ?? 'Unassigned'}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <AddCompanyDialog open={adding} onClose={() => { setAdding(false) }} />
    </div>
  )
}
