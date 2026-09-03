import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'

import { api } from '../../lib/api/client'

interface AuditEntry {
  readonly id: string
  readonly actorId: string
  readonly actorRole: string
  readonly action: string
  readonly resource: string
  readonly reason: string
  readonly succeeded: boolean
  readonly failureReason: string | null
  readonly approvalId: string | null
  readonly occurredAt: string
}

/**
 * Who did what, and why (architecture §11.3).
 *
 * Read-only. There is no route here that writes or deletes a record — an endpoint that
 * could add one by hand would make every record in the table arguable.
 */
export function AuditLogPage() {
  const [resource, setResource] = useState('')

  const entries = useQuery({
    queryKey: ['audit', resource],
    queryFn: () =>
      api.get<readonly AuditEntry[]>(`/v1/admin/audit/resources/${encodeURIComponent(resource)}`),

    // A resource is required. The audit table is large and "show me everything" is a
    // rather different question from the one anybody means to ask.
    enabled: resource.length > 3,
  })

  return (
    <div className="max-w-4xl space-y-4">
      <h1 className="text-[28px] font-semibold leading-[34px]">Audit log</h1>

      <div className="space-y-1.5">
        <label htmlFor="resource" className="block text-[13px] font-medium text-fg-secondary">
          Resource
        </label>
        <input
          id="resource"
          value={resource}
          onChange={(event) => { setResource(event.target.value); }}
          placeholder="ride:rid_88ff or zone:lagos"
          className="tabular h-10 w-full max-w-md rounded-md border border-line bg-surface px-3 text-[13px]"
        />
      </div>

      {entries.data?.length === 0 ? (
        <p className="rounded-lg border border-line-subtle bg-surface p-8 text-center text-[13px] text-fg-tertiary">
          Nothing has been done to that resource.
        </p>
      ) : null}

      <ul className="space-y-2">
        {entries.data?.map((entry) => (
          <li
            key={entry.id}
            className={`rounded-lg border bg-surface p-4 ${
              // A failed privileged action is still a privileged action, and it is
              // marked as one. Somebody tried; that it did not work is not a reason to
              // let it blend into the successes.
              entry.succeeded ? 'border-line-subtle' : 'border-[color:var(--border-danger)]'
            }`}
          >
            <div className="flex items-baseline justify-between gap-4">
              <p className="text-[13px]">
                <span className="font-medium">{entry.actorId}</span>
                <span className="text-fg-tertiary"> ({entry.actorRole})</span> — {entry.action}
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

            {entry.succeeded ? null : (
              <p className="mt-1 text-[13px] text-fg-danger">Failed: {entry.failureReason}</p>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}
