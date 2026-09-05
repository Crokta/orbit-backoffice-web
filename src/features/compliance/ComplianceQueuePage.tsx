import { Link } from '@tanstack/react-router'
import { useMemo, useState } from 'react'

import { api } from '../../lib/api/client'
import { useDebounced, usePagedList, type Page } from '../../lib/paging'
import { ExportButton, ListToolbar, Pagination, SearchBox } from '../shared/ListControls'
import { LoadError } from '../../components/ui/LoadError'

interface KycItem {
  readonly driverId: string
  readonly displayName: string
  readonly submittedAt: string
  readonly documentsOutstanding: readonly string[]
  readonly waitingHours: number
}

interface QueueFilters {
  readonly q: string | undefined
}

/**
 * Drivers waiting on a compliance decision.
 *
 * Ordered oldest first. Every hour in this queue is an hour somebody who wants to work
 * cannot, and a queue sorted by anything else quietly starves whoever applied first.
 * Searched and paged by the identity service, so a reviewer can find one applicant in
 * a queue of hundreds.
 */
export function ComplianceQueuePage() {
  const [search, setSearch] = useState('')
  const q = useDebounced(search.trim())
  const filters = useMemo<QueueFilters>(() => ({ q: q.length === 0 ? undefined : q }), [q])

  const queue = usePagedList<KycItem, QueueFilters>({
    key: ['compliance', 'queue'],
    filters,
    fetchPage: (params) => api.get<Page<KycItem>>('/v1/admin/compliance/queue', { query: { ...params } }),
  })

  return (
    <div className="max-w-4xl space-y-4">
      <h1 className="text-[28px] font-semibold leading-[34px]">KYC queue</h1>

      <ListToolbar actions={<ExportButton path="/v1/admin/compliance/queue/export.csv" query={{ q: filters.q }} filename="orbit-kyc-queue.csv" />}>
        <SearchBox value={search} onChange={setSearch} placeholder="Driver name or id" />
      </ListToolbar>

      {queue.query.isPending ? (
        <p className="text-[13px] text-fg-secondary">Loading queue…</p>
      ) : queue.query.isError ? (
        <LoadError error={queue.query.error} what="the KYC queue" onRetry={() => { void queue.query.refetch() }} />
      ) : (
        <>
          {queue.items.length === 0 ? (
            <p className="rounded-lg border border-line-subtle bg-surface p-8 text-center text-[13px] text-fg-tertiary">
              {q.length > 0 ? 'Nobody in the queue matches that.' : 'Nobody is waiting.'}
            </p>
          ) : null}

          <ul className="divide-y divide-line-subtle overflow-hidden rounded-lg border border-line-subtle bg-surface">
            {queue.items.map((item) => (
              <li key={item.driverId}>
                <Link
                  to="/kyc/$driverId"
                  params={{ driverId: item.driverId }}
                  className="flex items-center justify-between gap-4 px-4 py-3 hover:bg-hover"
                >
                  <div className="min-w-0">
                    <p className="text-[15px] font-medium">{item.displayName}</p>
                    <p className="truncate text-[13px] text-fg-secondary">
                      {item.documentsOutstanding.length === 0
                        ? 'All documents submitted'
                        : `Outstanding: ${item.documentsOutstanding.join(', ')}`}
                    </p>
                  </div>

                  <span
                    className={`tabular shrink-0 text-[13px] ${
                      item.waitingHours > 48 ? 'text-fg-warning' : 'text-fg-tertiary'
                    }`}
                  >
                    {item.waitingHours}h
                  </span>
                </Link>
              </li>
            ))}
          </ul>

          <Pagination list={queue} />
        </>
      )}
    </div>
  )
}
