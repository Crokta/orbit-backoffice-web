import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useMemo, useState } from 'react'

import { Button } from '../../components/ui/Button'
import { LoadError } from '../../components/ui/LoadError'
import { api, newIdempotencyKey } from '../../lib/api/client'
import { ApiError } from '../../lib/api/problem'
import { usePagedList, useDebounced, type Page } from '../../lib/paging'
import { queryKeys } from '../../lib/query/client'
import { ExportButton, FilterSelect, ListToolbar, Pagination, SearchBox } from '../shared/ListControls'

interface RateCard {
  readonly ruleId: string
  readonly ruleVersion: string
  readonly zoneId: string
  readonly vehicleClass: string
  readonly currency: string
  readonly baseFareMinor: number
  readonly perKilometreMinor: number
  readonly perMinuteMinor: number
  readonly bookingFeeMinor: number
  readonly minimumFareMinor: number
  readonly commissionRate: number
  readonly effectiveFrom: string
}

/** The ceiling pricing enforces. Repeated here so a typo is caught before an approval is raised. */
const MAX_RATE = 0.5

/**
 * The fare the preview is shown against.
 *
 * A percentage point means little on its own; the same change against a fare an operator
 * recognises is the thing they can actually sanity-check. ₦5,000 is an ordinary city trip.
 */
const EXAMPLE_FARE_MINOR = 500_000

function money(minor: number, currency: string) {
  return new Intl.NumberFormat('en-NG', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(minor / 100)
}

function percent(rate: number) {
  return `${(rate * 100).toFixed(1)}%`
}

/**
 * What the platform takes from every fare, and therefore what every driver is paid.
 *
 * A commission is not a setting that can be edited. Pricing rules are immutable and every ride
 * stores the version it was quoted under, so changing a rate publishes a successor and leaves
 * rides already quoted on the rate they were promised — which is what lets a driver's earnings
 * be explained months later. The screen says so, because an operator who expects an edit and
 * gets a new version will otherwise assume something went wrong.
 *
 * Every change goes through the four-eyes queue regardless of role.
 */
export function CommissionsPage() {
  const queryClient = useQueryClient()
  const [editing, setEditing] = useState<RateCard | null>(null)
  const [percentInput, setPercentInput] = useState('')
  const [reason, setReason] = useState('')

  const [search, setSearch] = useState('')
  const [vehicleClass, setVehicleClass] = useState<'any' | 'Economy' | 'Comfort' | 'Xl'>('any')
  const q = useDebounced(search.trim())
  const filters = useMemo(
    () => ({ q: q.length === 0 ? undefined : q, vehicleClass: vehicleClass === 'any' ? undefined : vehicleClass }),
    [q, vehicleClass],
  )

  const rateCards = usePagedList<RateCard, typeof filters>({
    key: queryKeys.commissions.all,
    filters,
    fetchPage: (params) => api.get<Page<RateCard>>('/v1/admin/commissions', { query: { ...params } }),
    initialLimit: 25,
  })

  const publish = useMutation({
    mutationFn: (input: { card: RateCard; rate: number }) =>
      api.post<{ applied: boolean; approvalRequestId: string | null }>('/v1/admin/commissions', {
        json: {
          zoneId: input.card.zoneId,
          vehicleClass: input.card.vehicleClass,
          commissionRate: input.rate,
          reason,
        },
        idempotencyKey: newIdempotencyKey(),
      }),
    onSuccess: () => {
      setEditing(null)
      setPercentInput('')
      setReason('')
      void queryClient.invalidateQueries({ queryKey: queryKeys.commissions.all })
    },
  })

  // Operators think in percent; the platform stores a fraction. The conversion happens here,
  // once, at the boundary — entering 20 and having it stored as 2000% is the mistake this
  // screen exists to make impossible.
  const parsedPercent = Number.parseFloat(percentInput)
  const rate = Number.isFinite(parsedPercent) ? parsedPercent / 100 : Number.NaN
  const rateIsValid = Number.isFinite(rate) && rate >= 0 && rate <= MAX_RATE
  const canSubmit = rateIsValid && reason.trim().length >= 10 && rate !== editing?.commissionRate

  return (
    <div className="max-w-5xl space-y-4">
      <h1 className="text-[28px] font-semibold leading-[34px]">Commissions</h1>

      <p className="text-[13px] text-fg-secondary">
        The platform&rsquo;s share of each fare, net of tolls and zone surcharges — those are
        passed through and never commissioned. Changing a rate needs a second approver and
        publishes a new rate-card version: rides already quoted keep the rate they were quoted
        at, and drivers see the new figure on their next offer.
      </p>

      <ListToolbar actions={<ExportButton path="/v1/admin/commissions/export.csv" query={filters} filename="orbit-commissions.csv" />}>
        <SearchBox value={search} onChange={setSearch} placeholder="Zone, class or rule version" />
        <FilterSelect
          label="Vehicle class"
          value={vehicleClass}
          onChange={setVehicleClass}
          options={[
            { value: 'any', label: 'Any class' },
            { value: 'Economy', label: 'Economy' },
            { value: 'Comfort', label: 'Comfort' },
            { value: 'Xl', label: 'XL' },
          ]}
        />
      </ListToolbar>

      {rateCards.query.isError ? (
        <LoadError
          error={rateCards.query.error}
          what="commission rates"
          onRetry={() => {
            void rateCards.query.refetch()
          }}
        />
      ) : null}

      {rateCards.query.isPending ? (
        <p className="text-[13px] text-fg-secondary">Loading rate cards…</p>
      ) : null}

      {!rateCards.query.isPending && !rateCards.query.isError && rateCards.items.length === 0 ? (
        <p className="rounded-lg border border-line-subtle bg-surface px-4 py-6 text-[13px] text-fg-secondary">
          {q.length > 0 || vehicleClass !== 'any'
            ? 'No rate card matches that.'
            : 'No rate cards are in force. Commission is set per zone and vehicle class, and there is nothing here until a zone has been priced.'}
        </p>
      ) : null}

      <div className="space-y-3">
        {rateCards.items.map((card) => {
          const isEditing = editing?.ruleId === card.ruleId
          const driverShare = 1 - card.commissionRate

          return (
            <article
              key={card.ruleId}
              className="rounded-lg border border-line-subtle bg-surface p-4"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-[15px] font-medium">
                    {card.vehicleClass}
                    <span className="text-fg-secondary"> · {card.zoneId}</span>
                  </p>

                  {/* Both sides of the split, because the platform's share is only half the
                      sentence and the driver's is the half that gets disputed. */}
                  <p className="mt-1 text-[13px] text-fg-secondary">
                    Platform takes {percent(card.commissionRate)}; the driver keeps{' '}
                    {percent(driverShare)}.
                  </p>

                  <p className="mt-1 text-[11px] text-fg-tertiary">
                    {money(card.baseFareMinor, card.currency)} base ·{' '}
                    {money(card.perKilometreMinor, card.currency)}/km ·{' '}
                    {money(card.perMinuteMinor, card.currency)}/min · min{' '}
                    {money(card.minimumFareMinor, card.currency)}
                  </p>

                  <p className="mt-1 truncate text-[11px] text-fg-tertiary">
                    {card.ruleVersion} · in force since{' '}
                    {new Date(card.effectiveFrom).toLocaleDateString()}
                  </p>
                </div>

                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    setEditing(card)
                    setPercentInput((card.commissionRate * 100).toFixed(1))
                    setReason('')
                  }}
                >
                  Change rate
                </Button>
              </div>

              {isEditing ? (
                <div className="mt-4 space-y-3 border-t border-line-subtle pt-4">
                  <div className="flex items-end gap-3">
                    <div>
                      <label
                        htmlFor={`rate-${card.ruleId}`}
                        className="block text-[13px] font-medium"
                      >
                        New commission
                      </label>

                      <div className="mt-1 flex items-center gap-2">
                        <input
                          id={`rate-${card.ruleId}`}
                          type="number"
                          inputMode="decimal"
                          min={0}
                          max={MAX_RATE * 100}
                          step={0.5}
                          value={percentInput}
                          onChange={(event) => {
                            setPercentInput(event.target.value)
                          }}
                          className="w-24 rounded-md border border-line bg-surface px-3 py-2 text-[13px]"
                        />
                        <span className="text-[13px] text-fg-secondary">%</span>
                      </div>
                    </div>

                    {/* What the change does to one real fare. A percentage point means little
                        on its own; the same change shown against a fare an operator recognises
                        is the thing they can actually sanity-check. */}
                    {rateIsValid ? (
                      <p className="pb-2 text-[11px] text-fg-tertiary">
                        On a {money(EXAMPLE_FARE_MINOR, card.currency)} fare the driver would
                        keep {money(EXAMPLE_FARE_MINOR * (1 - rate), card.currency)},{' '}
                        {/* Raising a commission lowers the driver's take. "up from" was
                            hardcoded, so a rise read as a rise in pay — the wrong direction
                            in the one sentence an operator uses to check themselves. */}
                        {rate > card.commissionRate ? 'down from' : 'up from'}{' '}
                        {money(EXAMPLE_FARE_MINOR * (1 - card.commissionRate), card.currency)}.
                      </p>
                    ) : (
                      <p className="pb-2 text-[11px] text-fg-danger">
                        Enter a percentage between 0 and {MAX_RATE * 100}.
                      </p>
                    )}
                  </div>

                  <div>
                    <label
                      htmlFor={`reason-${card.ruleId}`}
                      className="block text-[13px] font-medium"
                    >
                      Why
                    </label>

                    <textarea
                      id={`reason-${card.ruleId}`}
                      rows={2}
                      value={reason}
                      onChange={(event) => {
                        setReason(event.target.value)
                      }}
                      className="mt-1 w-full rounded-md border border-line bg-surface px-3 py-2 text-[13px]"
                      placeholder="Driver supply in this zone is short; cutting the platform share for the quarter."
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <p className="text-[11px] text-fg-tertiary">
                      This will be sent for a second approval. Nothing changes until it is
                      agreed.
                    </p>

                    <div className="flex gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setEditing(null)
                        }}
                      >
                        Cancel
                      </Button>

                      <Button
                        size="sm"
                        disabled={!canSubmit}
                        loading={publish.isPending}
                        onClick={() => {
                          publish.mutate({ card, rate })
                        }}
                      >
                        Send for approval
                      </Button>
                    </div>
                  </div>
                </div>
              ) : null}
            </article>
          )
        })}
      </div>

      {publish.data?.approvalRequestId != null ? (
        <p role="status" className="rounded-md bg-success-subtle px-4 py-3 text-[13px] text-fg-success">
          Sent for approval. The current rate is still in force until a second approver agrees.
        </p>
      ) : null}

      {publish.error !== null ? (
        <p role="alert" className="rounded-md bg-danger-subtle px-4 py-3 text-[13px] text-fg-danger">
          {publish.error instanceof ApiError && publish.error.status === 403
            ? 'You do not have the entitlement to change a commission rate.'
            : 'The change could not be raised.'}
        </p>
      ) : null}

      <Pagination list={rateCards} />
    </div>
  )
}
