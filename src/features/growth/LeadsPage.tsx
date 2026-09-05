import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useMemo, useRef, useState } from 'react'

import { api } from '../../lib/api/client'
import { cn } from '../../components/ui/cn'
import { LoadError } from '../../components/ui/LoadError'
import { useDebounced } from '../../lib/paging'
import { ExportButton, FilterSelect, ListToolbar, SearchBox } from '../shared/ListControls'

interface Lead {
  readonly id: string
  readonly name: string
  readonly email: string
  readonly organisation: string
  readonly volumeBand: string
  readonly source: string
  readonly status: LeadStatus
  readonly requestedAsset: string | null
  readonly deliveredAt: string | null
  readonly referrer: string | null
  readonly note: string | null
  readonly lastActorId: string | null
  readonly capturedAt: string
  readonly updatedAt: string | null
}

interface LeadPage {
  readonly items: readonly Lead[]
  readonly total: number
  readonly limit: number
  readonly offset: number
}

type LeadStatus = 'New' | 'Contacted' | 'Qualified' | 'Closed'

const STATUSES: readonly LeadStatus[] = ['New', 'Contacted', 'Qualified', 'Closed']

const STATUS_STYLE: Record<LeadStatus, string> = {
  New: 'bg-brand-subtle text-fg-brand',
  Contacted: 'bg-warning-subtle text-fg-warning',
  Qualified: 'bg-success-subtle text-fg-success',
  Closed: 'bg-subtle text-fg-tertiary',
}

const PAGE_SIZE = 50

/**
 * Enterprise enquiries from the public website.
 *
 * Every row here is a person who asked for the cost guide and gave us their work email
 * to get it. Two things follow from that, and the page is built around both.
 *
 * The **delivered** column is not decoration. If the guide did not go out, the person is
 * sitting with an empty inbox forming an opinion of us, and nothing else in the platform
 * will tell anybody. It is the first column after the name for that reason.
 *
 * There is no delete. A lead is personal data someone entrusted to us; removing it is a
 * data-subject request handled deliberately, not a button somebody clicks to tidy a list.
 */
export function LeadsPage() {
  const queryClient = useQueryClient()
  const [status, setStatus] = useState<LeadStatus | 'All'>('All')
  const [source, setSource] = useState<'All' | 'GuideDownload' | 'ContactForm'>('All')
  const [onlyUndelivered, setOnlyUndelivered] = useState(false)
  const [search, setSearch] = useState('')
  const [offset, setOffset] = useState(0)
  const [expanded, setExpanded] = useState<string | null>(null)

  const q = useDebounced(search.trim())

  const filters = useMemo(
    () => ({
      status: status === 'All' ? undefined : status,
      source: source === 'All' ? undefined : source,
      q: q.length === 0 ? undefined : q,
      undelivered: onlyUndelivered ? true : undefined,
    }),
    [status, source, q, onlyUndelivered],
  )

  // Filters changing resets to the first page: offset 100 of a different predicate is
  // not a page anybody asked for.
  const filterKey = JSON.stringify(filters)
  const lastFilterKey = useRef(filterKey)

  useEffect(() => {
    if (lastFilterKey.current !== filterKey) {
      lastFilterKey.current = filterKey
      setOffset(0)
    }
  }, [filterKey])

  // Offset-paged, unlike the rest of the console: leads arrive a few a day and the header
  // shows a total, which a keyset page cannot cheaply give.
  const leads = useQuery({
    queryKey: ['leads', filterKey, offset],
    queryFn: () => api.get<LeadPage>('/v1/admin/leads', { query: { ...filters, limit: PAGE_SIZE, offset } }),
    placeholderData: keepPreviousData,
  })

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['leads'] })

  const move = useMutation({
    mutationFn: (input: { readonly id: string; readonly status: LeadStatus }) =>
      api.post<Lead>(`/v1/admin/leads/${input.id}/status`, { json: { status: input.status } }),
    onSuccess: invalidate,
  })

  const resend = useMutation({
    mutationFn: (id: string) => api.post<Lead>(`/v1/admin/leads/${id}/resend`, { json: {} }),
    onSuccess: invalidate,
  })

  const page = leads.data
  const undelivered = page?.items.filter((lead) => lead.deliveredAt === null).length ?? 0

  return (
    <div className="max-w-6xl space-y-4">
      <header className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h1 className="text-[28px] font-semibold leading-[34px]">Leads</h1>
          <p className="mt-1 text-[13px] text-fg-tertiary">
            Enterprise enquiries from the website. {page?.total ?? 0} total.
          </p>
        </div>

        {undelivered > 0 ? (
          // Surfaced at the top rather than left to be noticed in a column. An
          // undelivered guide is a broken promise with a clock on it.
          <p className="rounded-md bg-danger-subtle px-3 py-1.5 text-[12px] text-fg-danger">
            {undelivered} guide{undelivered === 1 ? '' : 's'} not yet delivered
          </p>
        ) : null}
      </header>

      <ListToolbar actions={<ExportButton path="/v1/admin/leads/export.csv" query={{ ...filters }} filename="orbit-leads.csv" />}>
        <SearchBox value={search} onChange={setSearch} placeholder="Name, email, organisation or volume" />
        <FilterSelect
          label="Source"
          value={source}
          onChange={setSource}
          options={[
            { value: 'All', label: 'Any source' },
            { value: 'GuideDownload', label: 'Guide download' },
            { value: 'ContactForm', label: 'Contact form' },
          ]}
        />
        <label className="flex items-center gap-2 text-[13px] text-fg-secondary">
          <input type="checkbox" checked={onlyUndelivered} onChange={(event) => { setOnlyUndelivered(event.target.checked); }} />
          Guide not delivered
        </label>
      </ListToolbar>

      <div className="flex flex-wrap gap-1.5">
        {(['All', ...STATUSES] as const).map((value) => (
          <button
            key={value}
            type="button"
            onClick={() => {
              setStatus(value)
            }}
            className={cn(
              'h-8 rounded-md border px-3 text-[13px] transition-colors',
              status === value
                ? 'border-line-brand bg-brand-subtle text-fg-brand'
                : 'border-line-subtle bg-surface text-fg-secondary hover:bg-hover',
            )}
          >
            {value}
          </button>
        ))}
      </div>

      {leads.isError ? (
        <LoadError error={leads.error} what="leads" onRetry={() => { void leads.refetch() }} />
      ) : leads.isPending ? (
        <p className="rounded-lg border border-line-subtle bg-surface p-8 text-center text-[13px] text-fg-tertiary">
          Loading…
        </p>
      ) : null}

      {page?.items.length === 0 ? (
        <p className="rounded-lg border border-line-subtle bg-surface p-8 text-center text-[13px] text-fg-tertiary">
          {q.length > 0 || source !== 'All' || onlyUndelivered
            ? 'No lead matches that.'
            : status === 'All' ? 'No enquiries yet.' : `Nothing is marked ${status.toLowerCase()}.`}
        </p>
      ) : null}

      <ul className="space-y-2">
        {page?.items.map((lead) => (
          <li key={lead.id} className="rounded-lg border border-line-subtle bg-surface">
            <button
              type="button"
              onClick={() => { setExpanded(expanded === lead.id ? null : lead.id) }}
              aria-expanded={expanded === lead.id}
              className="flex w-full items-center gap-4 p-4 text-left hover:bg-hover"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-[14px] font-medium">
                  {lead.organisation}
                  <span className="ml-2 font-normal text-fg-tertiary">{lead.name}</span>
                </p>
                <p className="tabular mt-0.5 truncate text-[12px] text-fg-tertiary">
                  {lead.email} · {lead.volumeBand}
                </p>
              </div>

              <span
                className={cn(
                  'shrink-0 rounded-full px-2.5 py-1 text-[11px] font-medium',
                  lead.deliveredAt === null
                    ? 'bg-danger-subtle text-fg-danger'
                    : 'bg-success-subtle text-fg-success',
                )}
              >
                {lead.deliveredAt === null ? 'Guide pending' : 'Guide sent'}
              </span>

              <span
                className={cn(
                  'shrink-0 rounded-full px-2.5 py-1 text-[11px] font-medium',
                  STATUS_STYLE[lead.status],
                )}
              >
                {lead.status}
              </span>

              <span className="tabular hidden shrink-0 text-[11px] text-fg-tertiary sm:block">
                {new Date(lead.capturedAt).toLocaleDateString('en-NG')}
              </span>
            </button>

            {expanded === lead.id ? (
              <div className="space-y-4 border-t border-line-subtle p-4">
                <dl className="grid gap-x-6 gap-y-2 text-[12px] sm:grid-cols-2">
                  <Field label="Captured">
                    {new Date(lead.capturedAt).toLocaleString('en-NG')}
                  </Field>
                  <Field label="Guide delivered">
                    {lead.deliveredAt === null
                      ? 'Not yet — the worker retries every 30 seconds'
                      : new Date(lead.deliveredAt).toLocaleString('en-NG')}
                  </Field>
                  <Field label="Requested">{lead.requestedAsset ?? '—'}</Field>
                  <Field label="Came from">{lead.referrer ?? 'Unknown'}</Field>
                  {lead.note !== null ? <Field label="Note">{lead.note}</Field> : null}
                  {lead.lastActorId !== null ? (
                    <Field label="Last touched by">{lead.lastActorId}</Field>
                  ) : null}
                </dl>

                <div className="flex flex-wrap items-center gap-2">
                  {STATUSES.filter((value) => value !== lead.status).map((value) => (
                    <button
                      key={value}
                      type="button"
                      disabled={move.isPending}
                      onClick={() => { move.mutate({ id: lead.id, status: value }) }}
                      className="h-8 rounded-md border border-line-subtle bg-canvas px-3 text-[12px] hover:bg-hover disabled:opacity-50"
                    >
                      Mark {value.toLowerCase()}
                    </button>
                  ))}

                  <button
                    type="button"
                    disabled={resend.isPending}
                    onClick={() => { resend.mutate(lead.id) }}
                    className="h-8 rounded-md border border-line-brand bg-brand-subtle px-3 text-[12px] text-fg-brand hover:opacity-90 disabled:opacity-50"
                  >
                    Resend guide
                  </button>

                  <a
                    href={`mailto:${lead.email}?subject=${encodeURIComponent('Your Orbit cost guide')}`}
                    className="h-8 rounded-md border border-line-subtle bg-canvas px-3 text-[12px] leading-8 hover:bg-hover"
                  >
                    Email {lead.name.split(' ')[0]}
                  </a>
                </div>
              </div>
            ) : null}
          </li>
        ))}
      </ul>

      {page !== undefined && page.total > PAGE_SIZE ? (
        <div className="flex items-center justify-between text-[12px] text-fg-tertiary">
          <span className="tabular">
            {offset + 1}–{Math.min(offset + PAGE_SIZE, page.total)} of {page.total}
          </span>

          <div className="flex gap-2">
            <button
              type="button"
              disabled={offset === 0}
              onClick={() => { setOffset(Math.max(0, offset - PAGE_SIZE)) }}
              className="h-8 rounded-md border border-line-subtle bg-surface px-3 hover:bg-hover disabled:opacity-40"
            >
              Previous
            </button>
            <button
              type="button"
              disabled={offset + PAGE_SIZE >= page.total}
              onClick={() => { setOffset(offset + PAGE_SIZE) }}
              className="h-8 rounded-md border border-line-subtle bg-surface px-3 hover:bg-hover disabled:opacity-40"
            >
              Next
            </button>
          </div>
        </div>
      ) : null}
    </div>
  )
}

function Field({ label, children }: { readonly label: string; readonly children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-fg-tertiary">{label}</dt>
      <dd className="mt-0.5 break-words">{children}</dd>
    </div>
  )
}
