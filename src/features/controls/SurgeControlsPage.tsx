import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'

import { Button } from '../../components/ui/Button'
import { api, newIdempotencyKey } from '../../lib/api/client'
import { ApiError } from '../../lib/api/problem'
import { queryKeys } from '../../lib/query/client'

interface Zone {
  readonly zoneId: string
  readonly name: string
  readonly surgeMultiplier: number
  readonly surgeCap: number
  readonly killSwitchEngaged: boolean
  readonly killSwitchReason: string | null
  readonly killSwitchBy: string | null
}

/**
 * The surge kill-switch (architecture §9.3, §11.3).
 *
 * Surge unwinds on its own as supply recovers, but the smoothing that stops it
 * oscillating also means it unwinds over minutes. There are afternoons — a stadium
 * emptying, a weather event — where a multiplier becomes indefensible faster than the
 * maths can unwind it, and somebody needs to pin it to 1.0 now.
 *
 * Every change here goes through the four-eyes queue, whatever the operator's role. It
 * changes what every rider in a city pays.
 */
export function SurgeControlsPage() {
  const queryClient = useQueryClient()
  const [pending, setPending] = useState<{ zone: Zone; engage: boolean } | null>(null)
  const [reason, setReason] = useState('')

  const zones = useQuery({
    queryKey: queryKeys.zones.all,
    queryFn: () => api.get<readonly Zone[]>('/v1/admin/zones'),
    refetchInterval: 15_000,
  })

  const setSwitch = useMutation({
    mutationFn: ({ zone, engage }: { zone: Zone; engage: boolean }) =>
      api.post<{ applied: boolean; approvalRequestId: string | null }>(
        `/v1/admin/zones/${zone.zoneId}/surge-kill-switch`,
        { json: { engaged: engage, reason }, idempotencyKey: newIdempotencyKey() },
      ),
    onSuccess: () => {
      setPending(null)
      setReason('')
      void queryClient.invalidateQueries({ queryKey: queryKeys.zones.all })
    },
  })

  return (
    <div className="max-w-4xl space-y-4">
      <h1 className="text-[28px] font-semibold leading-[34px]">Surge &amp; zones</h1>

      <p className="text-[13px] text-fg-secondary">
        Engaging the kill-switch pins every cell in a zone to 1.0×. It needs a second approver
        and takes effect on the next quote, not retroactively — fares already quoted stand.
      </p>

      <div className="space-y-3">
        {zones.data?.map((zone) => (
          <article key={zone.zoneId} className="rounded-lg border border-line-subtle bg-surface p-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[15px] font-medium">{zone.name}</p>

                <p className="text-[13px] text-fg-secondary">
                  Current{' '}
                  <span className={zone.surgeMultiplier > 1 ? 'tabular text-fg-surge' : 'tabular'}>
                    {zone.surgeMultiplier.toFixed(1)}×
                  </span>{' '}
                  · cap {zone.surgeCap.toFixed(1)}×
                </p>

                {zone.killSwitchEngaged ? (
                  <p className="mt-1 text-[13px] text-fg-warning">
                    Suppressed by {zone.killSwitchBy}: {zone.killSwitchReason}
                  </p>
                ) : null}
              </div>

              <Button
                variant={zone.killSwitchEngaged ? 'secondary' : 'danger'}
                size="sm"
                onClick={() => {
                  setPending({ zone, engage: !zone.killSwitchEngaged })
                  setReason('')
                }}
              >
                {zone.killSwitchEngaged ? 'Restore surge' : 'Suppress surge'}
              </Button>
            </div>

            {pending?.zone.zoneId === zone.zoneId ? (
              <div className="mt-4 space-y-2 border-t border-line-subtle pt-4">
                <label htmlFor={`reason-${zone.zoneId}`} className="block text-[13px] font-medium">
                  Why
                </label>

                <textarea
                  id={`reason-${zone.zoneId}`}
                  rows={2}
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                  className="w-full rounded-md border border-line bg-surface px-3 py-2 text-[13px]"
                  placeholder={
                    pending.engage
                      ? 'Stadium emptying after the derby; multiplier is not defensible.'
                      : 'Crowd has dispersed and supply has recovered.'
                  }
                />

                <div className="flex items-center justify-between">
                  {/* Restoring surge is called out as loudly as suppressing it.
                      Turning it back on in a city is at least as consequential, and
                      only one of the two is ever anticipated. */}
                  <p className="text-[11px] text-fg-tertiary">
                    {pending.engage
                      ? 'This will be sent for a second approval.'
                      : 'Restoring surge is also sent for approval.'}
                  </p>

                  <div className="flex gap-2">
                    <Button variant="ghost" size="sm" onClick={() => setPending(null)}>
                      Cancel
                    </Button>

                    <Button
                      size="sm"
                      disabled={reason.trim().length < 10}
                      loading={setSwitch.isPending}
                      onClick={() => {
                        setSwitch.mutate(pending)
                      }}
                    >
                      Send for approval
                    </Button>
                  </div>
                </div>
              </div>
            ) : null}
          </article>
        ))}
      </div>

      {setSwitch.data?.approvalRequestId != null ? (
        <p role="status" className="rounded-md bg-success-subtle px-4 py-3 text-[13px] text-fg-success">
          Sent for approval. Nothing has changed yet — surge is still running in that zone.
        </p>
      ) : null}

      {setSwitch.error !== null ? (
        <p role="alert" className="rounded-md bg-danger-subtle px-4 py-3 text-[13px] text-fg-danger">
          {setSwitch.error instanceof ApiError && setSwitch.error.status === 403
            ? 'You do not have the entitlement to request this.'
            : 'The request could not be raised.'}
        </p>
      ) : null}
    </div>
  )
}
