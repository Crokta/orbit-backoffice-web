import { Link } from '@tanstack/react-router'
import { useMemo, useState } from 'react'

import { Money } from '../../components/ui/Money'
import { api } from '../../lib/api/client'
import { useDebounced, usePagedList, type Page } from '../../lib/paging'
import { queryKeys } from '../../lib/query/client'
import { LoadError } from '../../components/ui/LoadError'
import { ExportButton, FilterSelect, ListToolbar, Pagination, SearchBox } from '../shared/ListControls'

export interface LedgerAccount {
  readonly accountId: string
  readonly kind: string
  readonly type: string
  readonly balanceMinor: number
  readonly currency: string
  readonly postingCount: number
  readonly firstPostedAt: string
  readonly lastPostedAt: string
}

interface AccountFilters {
  readonly q: string | undefined
  readonly kind: string | undefined
  readonly type: string | undefined
}

const KINDS = ['any', 'rider', 'driver', 'platform', 'psp', 'bank'] as const
const TYPES = ['any', 'asset', 'liability', 'revenue', 'expense'] as const

/**
 * The ledgers (architecture §12.1): one row per account, with its balance.
 *
 * Read-only, and there is no route anywhere in this console that writes to the book.
 * Balances are derived from postings, never stored, and a screen that could adjust one
 * directly would break the property the whole subsystem rests on.
 *
 * Opening a row shows that ledger's transactions, paged and searchable.
 */
export function LedgerPage() {
  const [search, setSearch] = useState('')
  const [kind, setKind] = useState<(typeof KINDS)[number]>('any')
  const [type, setType] = useState<(typeof TYPES)[number]>('any')
  const q = useDebounced(search.trim())

  const filters = useMemo<AccountFilters>(
    () => ({ q: q.length === 0 ? undefined : q, kind: kind === 'any' ? undefined : kind, type: type === 'any' ? undefined : type }),
    [q, kind, type],
  )

  const accounts = usePagedList<LedgerAccount, AccountFilters>({
    key: [...queryKeys.ledger.all, 'accounts'],
    filters,
    fetchPage: (params) => api.get<Page<LedgerAccount>>('/v1/admin/ledger/accounts', { query: { ...params } }),
  })

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h1 className="text-[28px] font-semibold leading-[34px]">Ledgers</h1>
          <p className="mt-1 text-[13px] text-fg-tertiary">
            Every account with a posting. Balances are summed from the book on request; open a
            ledger for its transactions.
          </p>
        </div>

        <Link to="/ledger/$account" params={{ account: 'all' }} className="text-[12px] text-fg-brand hover:underline">
          Every posting, across all ledgers →
        </Link>
      </header>

      <ListToolbar actions={<ExportButton path="/v1/admin/ledger/accounts/export.csv" query={{ ...filters }} filename="orbit-ledger-accounts.csv" />}>
        <SearchBox value={search} onChange={setSearch} placeholder="Account name, e.g. drv_88ff or platform:" />
        <FilterSelect<(typeof KINDS)[number]>
          label="Owner kind"
          value={kind}
          onChange={setKind}
          options={KINDS.map((option) => ({ value: option, label: option === 'any' ? 'Any owner' : option === 'psp' ? 'PSP' : capitalise(option) }))}
        />
        <FilterSelect<(typeof TYPES)[number]>
          label="Account type"
          value={type}
          onChange={setType}
          options={TYPES.map((option) => ({ value: option, label: option === 'any' ? 'Any type' : capitalise(option) }))}
        />
      </ListToolbar>

      <div className="overflow-x-auto rounded-lg border border-line-subtle bg-surface">
        <table className="w-full min-w-[840px] border-collapse text-[13px]">
          <thead>
            <tr className="border-b border-line-subtle">
              {['Account', 'Owner', 'Type', 'Postings', 'First posted', 'Last posted'].map((header) => (
                <th
                  key={header}
                  scope="col"
                  className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-fg-tertiary"
                >
                  {header}
                </th>
              ))}
              <th scope="col" className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-wide text-fg-tertiary">
                Balance
              </th>
            </tr>
          </thead>

          <tbody>
            {accounts.query.isError ? (
              <tr>
                <td colSpan={7} className="px-4 py-6">
                  <LoadError error={accounts.query.error} what="the ledgers" onRetry={() => { void accounts.query.refetch() }} />
                </td>
              </tr>
            ) : accounts.query.isPending ? (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-fg-tertiary">
                  Loading ledgers…
                </td>
              </tr>
            ) : accounts.items.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-fg-tertiary">
                  {q.length > 0 || kind !== 'any' || type !== 'any' ? 'No ledger matches that.' : 'Nothing has been posted yet.'}
                </td>
              </tr>
            ) : (
              accounts.items.map((account) => (
                <tr key={account.accountId} className="border-b border-line-subtle last:border-0 hover:bg-hover">
                  <td className="tabular whitespace-nowrap px-4 py-3">
                    <Link
                      to="/ledger/$account"
                      params={{ account: account.accountId }}
                      className="text-fg-brand underline-offset-2 hover:underline"
                    >
                      {account.accountId}
                    </Link>
                  </td>
                  <td className="px-4 py-3 capitalize text-fg-secondary">{account.kind}</td>
                  <td className="px-4 py-3 capitalize text-fg-secondary">{account.type}</td>
                  <td className="tabular px-4 py-3">{account.postingCount.toLocaleString('en-NG')}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-fg-secondary">
                    {new Date(account.firstPostedAt).toLocaleDateString('en-NG')}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-fg-secondary">
                    {new Date(account.lastPostedAt).toLocaleString('en-NG')}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Money minorUnits={account.balanceMinor} currency={account.currency} />
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <Pagination list={accounts} />

      <p className="max-w-3xl text-[11px] text-fg-tertiary">
        Balances are signed by account type: what the platform owes a driver reads as a
        positive earnings balance, and platform revenue reads positive too. The sign convention
        is the payment service&rsquo;s, so this list agrees with each ledger&rsquo;s detail.
      </p>
    </div>
  )
}

function capitalise(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1)
}
