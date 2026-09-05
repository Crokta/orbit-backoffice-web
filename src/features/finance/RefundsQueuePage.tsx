import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useMemo, useState } from 'react'

import { Button } from '../../components/ui/Button'
import { Money } from '../../components/ui/Money'
import { api, newIdempotencyKey } from '../../lib/api/client'
import { ApiError } from '../../lib/api/problem'
import { dayBoundary, useDebounced, usePagedList, type Page } from '../../lib/paging'
import { queryKeys } from '../../lib/query/client'
import { LoadError } from '../../components/ui/LoadError'
import { DateRange, ExportButton, FilterSelect, ListToolbar, Pagination, SearchBox } from '../shared/ListControls'

export interface ApprovalRow {
  readonly requestId: string
  readonly action: string
  readonly resource: string
  readonly amountMinor: number | null
  readonly currency: string | null
  readonly requestedBy: string
  readonly justification: string
  readonly status: 'Pending' | 'Approved' | 'Rejected' | 'Expired'
  readonly decidedBy: string | null
  readonly requestedAt: string
  readonly expiresAt: string
}

export interface ApprovalFilters {
  readonly q: string | undefined
  readonly status: 'pending' | 'decided' | 'all'
  readonly action: string | undefined
  readonly from: string | undefined
  readonly to: string | undefined
}

/**
 * The four-eyes queue (architecture §11.3).
 *
 * The approver cannot be the requester. That is enforced in the aggregate, not here —
 * a client-side check is a courtesy — but the UI says so plainly, because being refused
 * with no explanation after typing a justification is a poor way to learn a rule.
 */
export function RefundsQueuePage() {
  return (
    <div className="max-w-4xl space-y-4">
      <h1 className="text-[28px] font-semibold leading-[34px]">Approvals</h1>

      <p className="text-[13px] text-fg-secondary">
        Requests expire after 48 hours. A refund approved today and executed in two months is
        not the decision anybody made.
      </p>

      <ApprovalList />
    </div>
  )
}

/**
 * The approval list with its controls, shared with the payouts screen so the queue is
 * decided in exactly one place.
 */
export function ApprovalList({ actionPrefix, exportName = 'orbit-approvals.csv' }: { readonly actionPrefix?: string; readonly exportName?: string }) {
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState<ApprovalFilters['status']>('pending')
  const [range, setRange] = useState({ from: '', to: '' })
  const q = useDebounced(search.trim())

  const filters = useMemo<ApprovalFilters>(
    () => ({
      q: q.length === 0 ? undefined : q,
      status,
      action: actionPrefix,
      from: dayBoundary(range.from, 'start'),
      to: dayBoundary(range.to, 'end'),
    }),
    [q, status, actionPrefix, range],
  )

  const queue = usePagedList<ApprovalRow, ApprovalFilters>({
    key: queryKeys.approvals.all,
    filters,
    fetchPage: (params) => api.get<Page<ApprovalRow>>('/v1/admin/approvals', { query: { ...params } }),
    initialLimit: 25,
    refetchInterval: 30_000,
  })

  const decide = useMutation({
    mutationFn: ({ requestId, approve }: { requestId: string; approve: boolean }) =>
      api.post(`/v1/admin/approvals/${requestId}/decide`, {
        json: { approve, note: approve ? 'Approved after review.' : 'Rejected after review.' },
        idempotencyKey: newIdempotencyKey(),
      }),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.approvals.all })
    },
  })

  return (
    <div className="space-y-4">
      <ListToolbar actions={<ExportButton path="/v1/admin/approvals/export.csv" query={{ ...filters }} filename={exportName} />}>
        <SearchBox value={search} onChange={setSearch} placeholder="Resource, action, requester or justification" />
        <FilterSelect<ApprovalFilters['status']>
          label="Status"
          value={status}
          onChange={setStatus}
          options={[
            { value: 'pending', label: 'Awaiting a decision' },
            { value: 'decided', label: 'Decided' },
            { value: 'all', label: 'All requests' },
          ]}
        />
        <DateRange from={range.from} to={range.to} onChange={setRange} />
      </ListToolbar>

      {queue.query.isPending ? (
        <p className="text-[13px] text-fg-secondary">Loading queue…</p>
      ) : queue.query.isError ? (
        <LoadError error={queue.query.error} what="the approvals queue" onRetry={() => { void queue.query.refetch() }} />
      ) : (
        <>
          {queue.items.length === 0 ? (
            <p className="rounded-lg border border-line-subtle bg-surface p-8 text-center text-[13px] text-fg-tertiary">
              {q.length > 0 || status !== 'pending' ? 'No request matches that.' : 'Nothing is waiting.'}
            </p>
          ) : null}

          {queue.items.map((row) => (
            <article key={row.requestId} className="rounded-lg border border-line-subtle bg-surface p-4">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-[15px] font-medium">{row.action}</p>
                  <p className="tabular text-[13px] text-fg-secondary">{row.resource}</p>
                  <p className="mt-1 text-[13px]">{row.justification}</p>
                  <p className="mt-1 text-[11px] text-fg-tertiary">
                    Requested by {row.requestedBy} · {new Date(row.requestedAt).toLocaleString('en-NG')}
                    {row.status === 'Pending'
                      ? ` · expires ${new Date(row.expiresAt).toLocaleString('en-NG')}`
                      : ` · ${row.status.toLowerCase()}${row.decidedBy === null ? '' : ` by ${row.decidedBy}`}`}
                  </p>
                </div>

                {row.amountMinor !== null && row.currency !== null ? (
                  <Money
                    minorUnits={row.amountMinor}
                    currency={row.currency}
                    className="shrink-0 text-[17px] font-medium"
                  />
                ) : null}
              </div>

              {row.status === 'Pending' ? (
                <div className="mt-4 flex justify-end gap-2">
                  <Button
                    variant="secondary"
                    size="sm"
                    loading={decide.isPending}
                    onClick={() => {
                      decide.mutate({ requestId: row.requestId, approve: false })
                    }}
                  >
                    Reject
                  </Button>

                  <Button
                    size="sm"
                    loading={decide.isPending}
                    onClick={() => {
                      decide.mutate({ requestId: row.requestId, approve: true })
                    }}
                  >
                    Approve
                  </Button>
                </div>
              ) : null}
            </article>
          ))}

          <Pagination list={queue} />
        </>
      )}

      {decide.error !== null ? (
        <p role="alert" className="rounded-md bg-danger-subtle px-4 py-3 text-[13px] text-fg-danger">
          {decide.error instanceof ApiError && decide.error.code === 'approval.self_approval'
            ? 'You raised this request, so somebody else has to decide it.'
            : decide.error instanceof ApiError && decide.error.code === 'approval.expired'
              ? 'That request expired. It has to be raised again.'
              : 'The decision could not be recorded.'}
        </p>
      ) : null}
    </div>
  )
}
