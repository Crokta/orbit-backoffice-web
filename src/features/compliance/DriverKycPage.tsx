import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useParams } from '@tanstack/react-router'
import { useState } from 'react'

import { Button } from '../../components/ui/Button'
import { api, newIdempotencyKey } from '../../lib/api/client'
import { LoadError } from '../../components/ui/LoadError'

interface KycDetail {
  readonly driverId: string
  readonly displayName: string
  readonly phone: string
  readonly submittedAt: string
  readonly documents: readonly KycDocument[]
  readonly checks: readonly KycCheck[]
}

interface KycDocument {
  readonly type: string
  readonly status: 'pending' | 'accepted' | 'rejected'
  readonly expiresAt: string | null
  readonly uploadedAt: string
}

interface KycCheck {
  readonly name: string
  readonly outcome: 'pass' | 'fail' | 'review'
  readonly detail: string
}

/**
 * One driver's compliance file.
 *
 * A rejection needs a reason, and the reason is shown to the driver. §11.2 requires an
 * appeal path, and an appeal against an unexplained decision is not one — the driver
 * has nothing to answer.
 */
export function DriverKycPage() {
  const { driverId } = useParams({ from: '/authenticated/kyc/$driverId' })
  const queryClient = useQueryClient()
  const [reason, setReason] = useState('')

  const detail = useQuery({
    queryKey: ['compliance', 'driver', driverId],
    queryFn: () => api.get<KycDetail>(`/v1/admin/compliance/drivers/${driverId}`),
  })

  const decide = useMutation({
    mutationFn: (approve: boolean) =>
      api.post(`/v1/admin/compliance/drivers/${driverId}/decide`, {
        json: { approve, reason },
        idempotencyKey: newIdempotencyKey(),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['compliance'] })
    },
  })

  if (detail.isPending) {
    return <p className="text-[13px] text-fg-secondary">Loading…</p>
  }

  if (detail.isError) {
    return <LoadError error={detail.error} what="this driver" onRetry={() => { void detail.refetch() }} />
  }

  const data = detail.data

  return (
    <div className="max-w-3xl space-y-5">
      <header>
        <h1 className="text-[28px] font-semibold leading-[34px]">{data.displayName}</h1>
        <p className="text-[13px] text-fg-secondary">{data.phone}</p>
      </header>

      <section className="rounded-lg border border-line-subtle bg-surface p-4">
        <h2 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-fg-tertiary">
          Automated checks
        </h2>

        <ul className="space-y-2">
          {data.checks.map((check) => (
            <li key={check.name} className="flex items-start justify-between gap-4 text-[13px]">
              <div>
                <p className="font-medium">{check.name}</p>
                <p className="text-fg-secondary">{check.detail}</p>
              </div>

              <span
                className={`shrink-0 font-semibold ${
                  check.outcome === 'pass'
                    ? 'text-fg-success'
                    : check.outcome === 'fail'
                      ? 'text-fg-danger'
                      : 'text-fg-warning'
                }`}
              >
                {check.outcome}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section className="rounded-lg border border-line-subtle bg-surface p-4">
        <h2 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-fg-tertiary">
          Documents
        </h2>

        <ul className="space-y-2">
          {data.documents.map((doc) => (
            <li key={doc.type} className="flex items-center justify-between text-[13px]">
              <span>{doc.type}</span>

              <span className="text-fg-secondary">
                {doc.expiresAt === null
                  ? 'No expiry'
                  : // Expiry is enforced automatically after approval: an expired
                    // insurance document takes the driver offline without anybody
                    // having to notice (§11.2).
                    `Expires ${new Date(doc.expiresAt).toLocaleDateString('en-NG')}`}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section className="rounded-lg border border-line-subtle bg-surface p-4">
        <label htmlFor="reason" className="block text-[13px] font-medium">
          Decision note (shown to the driver on a rejection)
        </label>

        <textarea
          id="reason"
          rows={3}
          value={reason}
          onChange={(event) => { setReason(event.target.value); }}
          className="mt-1 w-full rounded-md border border-line bg-surface px-3 py-2 text-[13px]"
          placeholder="The vehicle photograph does not show the registration plate clearly."
        />

        <div className="mt-3 flex justify-end gap-2">
          <Button
            variant="danger"
            size="sm"
            // A rejection without a reason is refused. The driver has to be able to
            // fix whatever it was and come back.
            disabled={reason.trim().length < 10}
            loading={decide.isPending}
            onClick={() => {
              decide.mutate(false)
            }}
          >
            Reject
          </Button>

          <Button
            size="sm"
            loading={decide.isPending}
            onClick={() => {
              decide.mutate(true)
            }}
          >
            Approve
          </Button>
        </div>
      </section>
    </div>
  )
}
