import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { Button } from '../../components/ui/Button'
import { Money } from '../../components/ui/Money'
import { api, newIdempotencyKey } from '../../lib/api/client'
import { ApiError } from '../../lib/api/problem'
import { queryKeys } from '../../lib/query/client'
import { LoadError } from '../../components/ui/LoadError'

interface ApprovalRow {
  readonly requestId: string
  readonly action: string
  readonly resource: string
  readonly amountMinor: number | null
  readonly currency: string | null
  readonly requestedBy: string
  readonly justification: string
  readonly requestedAt: string
  readonly expiresAt: string
}

/**
 * The four-eyes queue (architecture §11.3).
 *
 * The approver cannot be the requester. That is enforced in the aggregate, not here —
 * a client-side check is a courtesy — but the UI says so plainly, because being refused
 * with no explanation after typing a justification is a poor way to learn a rule.
 */
export function RefundsQueuePage() {
  const queryClient = useQueryClient()

  const queue = useQuery({
    queryKey: queryKeys.approvals.queue(),
    queryFn: () => api.get<readonly ApprovalRow[]>('/v1/admin/approvals'),
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

  if (queue.isPending) {
    return <p className="text-[13px] text-fg-secondary">Loading queue…</p>
  }

  if (queue.isError) {
    return <LoadError error={queue.error} what="the approvals queue" onRetry={() => { void queue.refetch() }} />
  }

  return (
    <div className="max-w-4xl space-y-4">
      <h1 className="text-[28px] font-semibold leading-[34px]">Approvals</h1>

      <p className="text-[13px] text-fg-secondary">
        Requests expire after 48 hours. A refund approved today and executed in two months is
        not the decision anybody made.
      </p>

      {queue.data.length === 0 ? (
        <p className="rounded-lg border border-line-subtle bg-surface p-8 text-center text-[13px] text-fg-tertiary">
          Nothing is waiting.
        </p>
      ) : null}

      {queue.data.map((row) => (
        <article key={row.requestId} className="rounded-lg border border-line-subtle bg-surface p-4">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="text-[15px] font-medium">{row.action}</p>
              <p className="tabular text-[13px] text-fg-secondary">{row.resource}</p>
              <p className="mt-1 text-[13px]">{row.justification}</p>
              <p className="mt-1 text-[11px] text-fg-tertiary">
                Requested by {row.requestedBy} · expires{' '}
                {new Date(row.expiresAt).toLocaleString('en-NG')}
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
        </article>
      ))}

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
