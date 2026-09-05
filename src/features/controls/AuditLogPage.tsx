import { useMemo, useState } from 'react'

import { LoadError } from '../../components/ui/LoadError'
import { api } from '../../lib/api/client'
import { ApiError } from '../../lib/api/problem'
import { dayBoundary, useDebounced, usePagedList, type Page } from '../../lib/paging'
import { DateRange, ExportButton, FilterSelect, ListToolbar, Pagination, SearchBox } from '../shared/ListControls'

interface AuditEntry {
  readonly id: string
  readonly actorId: string
  readonly actorRole: string
  readonly action: string
  readonly resource: string
  readonly reason: string
  readonly succeeded: boolean
  readonly failureReason: string | null
  readonly outcome: string | null
  readonly approvalId: string | null
  readonly occurredAt: string
}

interface AuditFilters {
  readonly q: string | undefined
  readonly resource: string | undefined
  readonly actor: string | undefined
  readonly succeeded: boolean | undefined
  readonly from: string | undefined
  readonly to: string | undefined
}

/**
 * Who did what, and why (architecture §11.3).
 *
 * Read-only. There is no route here that writes or deletes a record — an endpoint that
 * could add one by hand would make every record in the table arguable.
 *
 * Two views. Anybody on the console can look up what was done to one named resource;
 * the whole trail across the platform is a record of colleagues' actions and is open to
 * ops managers only. Naming a resource switches to the first, so a support agent gets an
 * answer rather than a 403.
 */
export function AuditLogPage() {
  const [resource, setResource] = useState('')
  const [search, setSearch] = useState('')
  const [actor, setActor] = useState('')
  const [outcome, setOutcome] = useState<'all' | 'succeeded' | 'failed'>('all')
  const [range, setRange] = useState({ from: '', to: '' })

  const resourceQ = useDebounced(resource.trim())
  const q = useDebounced(search.trim())
  const actorQ = useDebounced(actor.trim())

  const filters = useMemo<AuditFilters>(
    () => ({
      q: q.length === 0 ? undefined : q,
      resource: resourceQ.length === 0 ? undefined : resourceQ,
      actor: actorQ.length === 0 ? undefined : actorQ,
      succeeded: outcome === 'all' ? undefined : outcome === 'succeeded',
      from: dayBoundary(range.from, 'start'),
      to: dayBoundary(range.to, 'end'),
    }),
    [q, resourceQ, actorQ, outcome, range],
  )

  const scoped = filters.resource !== undefined

  const entries = usePagedList<AuditEntry, AuditFilters>({
    key: ['audit'],
    filters,
    fetchPage: (params) =>
      scoped
        ? api.get<Page<AuditEntry>>(`/v1/admin/audit/resources/${encodeURIComponent(params.resource ?? '')}`, {
            query: { q: params.q, cursor: params.cursor, limit: params.limit },
          })
        : api.get<Page<AuditEntry>>('/v1/admin/audit', { query: { ...params } }),
    initialLimit: 100,
  })

  const forbidden = entries.query.error instanceof ApiError && entries.query.error.status === 403

  return (
    <div className="max-w-4xl space-y-4">
      <h1 className="text-[28px] font-semibold leading-[34px]">Audit log</h1>

      <ListToolbar
        actions={
          <ExportButton
            path="/v1/admin/audit/export.csv"
            query={{ ...filters }}
            filename="orbit-audit-log.csv"
            disabled={forbidden}
          />
        }
      >
        <input
          value={resource}
          onChange={(event) => { setResource(event.target.value); }}
          placeholder="Resource, e.g. ride:rid_88ff or zone:lagos"
          aria-label="Resource"
          className="tabular h-9 w-72 rounded-md border border-line bg-surface px-3 text-[13px] placeholder:text-fg-tertiary"
        />
        <SearchBox value={search} onChange={setSearch} placeholder="Action, reason or outcome" className="w-56" />
        <input
          value={actor}
          onChange={(event) => { setActor(event.target.value); }}
          placeholder="Operator id"
          aria-label="Filter by operator"
          className="tabular h-9 w-40 rounded-md border border-line bg-surface px-3 text-[13px] placeholder:text-fg-tertiary"
          disabled={scoped}
        />
        <FilterSelect
          label="Outcome"
          value={outcome}
          onChange={setOutcome}
          options={[
            { value: 'all', label: 'Succeeded and failed' },
            { value: 'succeeded', label: 'Succeeded' },
            { value: 'failed', label: 'Failed' },
          ]}
        />
        <DateRange from={range.from} to={range.to} onChange={setRange} />
      </ListToolbar>

      {entries.query.isError ? (
        forbidden ? (
          <p className="rounded-lg border border-line-subtle bg-surface p-8 text-center text-[13px] text-fg-tertiary">
            The whole trail is open to ops managers. Name a resource above to see what has been
            done to it.
          </p>
        ) : (
          <LoadError error={entries.query.error} what="the audit trail" onRetry={() => { void entries.query.refetch() }} />
        )
      ) : entries.query.isPending ? (
        <p className="text-[13px] text-fg-secondary">Loading…</p>
      ) : entries.items.length === 0 ? (
        <p className="rounded-lg border border-line-subtle bg-surface p-8 text-center text-[13px] text-fg-tertiary">
          {scoped ? 'Nothing has been done to that resource.' : 'Nothing matches that.'}
        </p>
      ) : null}

      <ul className="space-y-2">
        {entries.items.map((entry) => (
          <li
            key={entry.id}
            className={`rounded-lg border bg-surface p-4 ${
              entry.succeeded ? 'border-line-subtle' : 'border-[color:var(--border-danger)]'
            }`}
          >
            <div className="flex items-baseline justify-between gap-4">
              <p className="text-[13px]">
                <span className="font-medium">{entry.actorId}</span>
                <span className="text-fg-tertiary"> ({entry.actorRole})</span> — {entry.action}
                <span className="tabular text-fg-tertiary"> · {entry.resource}</span>
              </p>

              <p className="shrink-0 text-[11px] text-fg-tertiary">
                {new Date(entry.occurredAt).toLocaleString('en-NG')}
              </p>
            </div>

            <p className="mt-1 text-[13px] text-fg-secondary">{entry.reason}</p>

            {entry.approvalId !== null ? (
              <p className="tabular mt-1 text-[11px] text-fg-tertiary">
                Approved under {entry.approvalId}
              </p>
            ) : null}

            {/* What it actually did, not just that it happened. "Changed a commission" and
                "changed it to default-comfort-20260905052315" answer different questions,
                and only the second one survives being asked six months later. */}
            {entry.succeeded && entry.outcome !== null ? (
              <p className="tabular mt-1 text-[11px] text-fg-tertiary">
                Result: {entry.outcome}
              </p>
            ) : null}

            {entry.succeeded ? null : (
              <p className="mt-1 text-[13px] text-fg-danger">Failed: {entry.failureReason}</p>
            )}
          </li>
        ))}
      </ul>

      {!entries.query.isError && !entries.query.isPending && <Pagination list={entries} />}
    </div>
  )
}
