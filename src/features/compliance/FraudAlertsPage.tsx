import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'

import { Button } from '../../components/ui/Button'
import { api, newIdempotencyKey } from '../../lib/api/client'
import { queryKeys } from '../../lib/query/client'
import { LoadError } from '../../components/ui/LoadError'

interface FraudCase {
  readonly caseId: string
  readonly subjectId: string
  readonly subjectType: string
  readonly appliedAction: string
  readonly riskScore: number
  readonly summary: string
  readonly features: readonly Feature[]
  readonly openedAt: string
}

interface Feature {
  readonly name: string
  readonly contribution: number
  readonly description: string
}

/**
 * The fraud review queue (architecture §15.3).
 *
 * This screen is the half of the fraud subsystem that makes the other half acceptable.
 * Automated action without a staffed queue behind it is not fraud prevention, it is an
 * unappealable suspension machine.
 */
export function FraudAlertsPage() {
  const queryClient = useQueryClient()
  const [note, setNote] = useState<Record<string, string>>({})

  const cases = useQuery({
    queryKey: queryKeys.fraud.queue(),
    queryFn: () => api.get<readonly FraudCase[]>('/v1/fraud/cases'),
  })

  const resolve = useMutation({
    mutationFn: ({ caseId, uphold }: { caseId: string; uphold: boolean }) =>
      api.post(`/v1/fraud/cases/${caseId}/resolve`, {
        json: { uphold, note: note[caseId] ?? '' },
        idempotencyKey: newIdempotencyKey(),
      }),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.fraud.all })
    },
  })

  if (cases.isPending) {
    return <p className="text-[13px] text-fg-secondary">Loading cases…</p>
  }

  if (cases.isError) {
    return <LoadError error={cases.error} what="fraud alerts" onRetry={() => { void cases.refetch() }} />
  }

  return (
    <div className="max-w-4xl space-y-4">
      <h1 className="text-[28px] font-semibold leading-[34px]">Fraud alerts</h1>

      {cases.data.length === 0 ? (
        <p className="rounded-lg border border-line-subtle bg-surface p-8 text-center text-[13px] text-fg-tertiary">
          Nothing is open.
        </p>
      ) : null}

      {cases.data.map((item) => (
        <article key={item.caseId} className="rounded-lg border border-line-subtle bg-surface p-4">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="text-[15px] font-medium">
                {item.subjectType} {item.subjectId}
              </p>
              <p className="text-[13px] text-fg-secondary">{item.summary}</p>
            </div>

            <div className="shrink-0 text-right">
              <p className="tabular text-[20px] font-semibold leading-[26px]">
                {item.riskScore.toFixed(2)}
              </p>
              <p
                className={`text-[11px] font-semibold uppercase ${
                  item.appliedAction === 'Suspend' ? 'text-fg-danger' : 'text-fg-warning'
                }`}
              >
                {item.appliedAction}
              </p>
            </div>
          </div>

          {/*
            The features, always shown. A decision that cannot be explained cannot be
            appealed, and an unappealable automated suspension is exactly the failure
            mode §15.3 exists to prevent. These are the words a reviewer reads aloud to
            a driver.
          */}
          <ul className="mt-3 space-y-1 border-l-2 border-line pl-3">
            {item.features.map((feature) => (
              <li key={feature.name} className="text-[13px]">
                <span className="tabular text-fg-tertiary">
                  {(feature.contribution * 100).toFixed(0)}%
                </span>{' '}
                <span className="text-fg-secondary">{feature.description}</span>
              </li>
            ))}
          </ul>

          <textarea
            rows={2}
            value={note[item.caseId] ?? ''}
            onChange={(event) => { setNote((previous) => ({ ...previous, [item.caseId]: event.target.value })); }}
            aria-label="Decision note"
            className="mt-3 w-full rounded-md border border-line bg-surface px-3 py-2 text-[13px]"
            placeholder="What you checked, and what you concluded."
          />

          <div className="mt-3 flex justify-end gap-2">
            <Button
              variant="secondary"
              size="sm"
              loading={resolve.isPending}
              onClick={() => {
                resolve.mutate({ caseId: item.caseId, uphold: false })
              }}
            >
              {/* Dismissing actually lifts the suspension. A queue where "dismissed"
                  leaves the punishment in place looks like due process and delivers
                  none. */}
              Dismiss and lift
            </Button>

            <Button
              variant="danger"
              size="sm"
              loading={resolve.isPending}
              onClick={() => {
                resolve.mutate({ caseId: item.caseId, uphold: true })
              }}
            >
              Uphold
            </Button>
          </div>
        </article>
      ))}
    </div>
  )
}
