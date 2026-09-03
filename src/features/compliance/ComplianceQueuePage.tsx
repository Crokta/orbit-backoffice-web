import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'

import { api } from '../../lib/api/client'

interface KycItem {
  readonly driverId: string
  readonly displayName: string
  readonly submittedAt: string
  readonly documentsOutstanding: readonly string[]
  readonly waitingHours: number
}

/**
 * Drivers waiting on a compliance decision.
 *
 * Ordered oldest first. Every hour in this queue is an hour somebody who wants to work
 * cannot, and a queue sorted by anything else quietly starves whoever applied first.
 */
export function ComplianceQueuePage() {
  const { data, isPending } = useQuery({
    queryKey: ['compliance', 'queue'],
    queryFn: () => api.get<readonly KycItem[]>('/v1/admin/compliance/queue'),
  })

  if (isPending) {
    return <p className="text-[13px] text-fg-secondary">Loading queue…</p>
  }

  return (
    <div className="max-w-4xl space-y-4">
      <h1 className="text-[28px] font-semibold leading-[34px]">KYC queue</h1>

      {data?.length === 0 ? (
        <p className="rounded-lg border border-line-subtle bg-surface p-8 text-center text-[13px] text-fg-tertiary">
          Nobody is waiting.
        </p>
      ) : null}

      <ul className="divide-y divide-line-subtle overflow-hidden rounded-lg border border-line-subtle bg-surface">
        {data?.map((item) => (
          <li key={item.driverId}>
            <Link
              to="/compliance/drivers/$driverId"
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
                  // The SLA is 48 hours. Past it the number turns amber, because a
                  // queue where nothing ever looks urgent is a queue nobody hurries on.
                  item.waitingHours > 48 ? 'text-fg-warning' : 'text-fg-tertiary'
                }`}
              >
                {item.waitingHours}h
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}
