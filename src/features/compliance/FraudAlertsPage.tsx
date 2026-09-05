import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useMemo, useState } from 'react'

import { Button } from '../../components/ui/Button'
import { api, newIdempotencyKey } from '../../lib/api/client'
import { useDebounced, usePagedList, type Page } from '../../lib/paging'
import { queryKeys } from '../../lib/query/client'
import { ExportButton, FilterSelect, ListToolbar, Pagination, SearchBox } from '../shared/ListControls'
import { LoadError } from '../../components/ui/LoadError'

interface FraudCase {
  readonly caseId: string
  readonly subjectId: string
  readonly subjectType: string
  readonly status: string
  readonly appliedAction: string
  readonly riskScore: number
  readonly summary: string
  readonly features: readonly Feature[]
  readonly openedAt: string
  readonly resolvedAt: string | null
  readonly resolutionNote: string | null
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
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState<'open' | 'resolved' | 'all'>('open')
  const [action, setAction] = useState<'any' | 'Flag' | 'Challenge' | 'Block' | 'Suspend'>('any')
  const [subject, setSubject] = useState<'any' | 'Rider' | 'Driver' | 'Device'>('any')

  const q = useDebounced(search.trim())
  const filters = useMemo(
    () => ({
      q: q.length === 0 ? undefined : q,
      status,
      action: action === 'any' ? undefined : action,
      subjectType: subject === 'any' ? undefined : subject,
    }),
    [q, status, action, subject],
  )

  // Straight to the fraud service, as before: the console reaches it through the gateway
  // and there is no BFF surface for cases.
  const cases = usePagedList<FraudCase, typeof filters>({
    key: queryKeys.fraud.all,
    filters,
    fetchPage: (params) => api.get<Page<FraudCase>>('/v1/fraud/cases', { query: { ...params } }),
    initialLimit: 25,
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

  const toolbar = (
    <ListToolbar actions={<ExportButton path="/v1/fraud/cases/export.csv" query={filters} filename="orbit-fraud-cases.csv" />}>
      <SearchBox value={search} onChange={setSearch} placeholder="Case, subject, ride or reason" />
      <FilterSelect
        label="Status"
        value={status}
        onChange={setStatus}
        options={[
          { value: 'open', label: 'Open' },
          { value: 'resolved', label: 'Resolved' },
          { value: 'all', label: 'All cases' },
        ]}
      />
      <FilterSelect
        label="Applied action"
        value={action}
        onChange={setAction}
        options={[
          { value: 'any', label: 'Any action' },
          { value: 'Flag', label: 'Flag' },
          { value: 'Challenge', label: 'Challenge' },
          { value: 'Block', label: 'Block' },
          { value: 'Suspend', label: 'Suspend' },
        ]}
      />
      <FilterSelect
        label="Subject"
        value={subject}
        onChange={setSubject}
        options={[
          { value: 'any', label: 'Any subject' },
          { value: 'Rider', label: 'Riders' },
          { value: 'Driver', label: 'Drivers' },
          { value: 'Device', label: 'Devices' },
        ]}
      />
    </ListToolbar>
  )

  if (cases.query.isPending) {
    return (
      <div className="max-w-4xl space-y-4">
        <h1 className="text-[28px] font-semibold leading-[34px]">Fraud alerts</h1>
        {toolbar}
        <p className="text-[13px] text-fg-secondary">Loading cases…</p>
      </div>
    )
  }

  if (cases.query.isError) {
    return (
      <div className="max-w-4xl space-y-4">
        <h1 className="text-[28px] font-semibold leading-[34px]">Fraud alerts</h1>
        {toolbar}
        <LoadError error={cases.query.error} what="fraud alerts" onRetry={() => { void cases.query.refetch() }} />
      </div>
    )
  }

  return (
    <div className="max-w-4xl space-y-4">
      <h1 className="text-[28px] font-semibold leading-[34px]">Fraud alerts</h1>

      {toolbar}

      {cases.items.length === 0 ? (
        <p className="rounded-lg border border-line-subtle bg-surface p-8 text-center text-[13px] text-fg-tertiary">
          {q.length > 0 || action !== 'any' || subject !== 'any' ? 'No case matches that.' : status === 'open' ? 'Nothing is open.' : 'No cases.'}
        </p>
      ) : null}

      {cases.items.map((item) => (
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

          {item.resolvedAt !== null ? (
            <p className="mt-3 text-[12px] text-fg-tertiary">
              {item.status} {new Date(item.resolvedAt).toLocaleString('en-NG')}
              {item.resolutionNote !== null && item.resolutionNote.length > 0 ? ` · ${item.resolutionNote}` : ''}
            </p>
          ) : (
          <>
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
          </>
          )}
        </article>
      ))}

      <Pagination list={cases} />
    </div>
  )
}
