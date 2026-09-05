import { api, newIdempotencyKey } from '../../lib/api/client'
import { API_BASE_URL } from '../../lib/api/base-url'
import { getAccessToken } from '../../lib/auth/session'
import { type Page } from '../../lib/paging'

/**
 * Everything the corporate module calls, typed once.
 *
 * The shapes mirror the admin BFF's records field for field. The BFF in turn mirrors the
 * enterprise service, so a field here is a field an account manager can rely on.
 */

export type CompanyStatus = 'draft' | 'onboarding' | 'live' | 'at_risk' | 'churned'

export type OnboardingStage = 'signed' | 'kyb_review' | 'billing_setup' | 'employee_import' | 'policy_go_live' | 'live'

export type InvoiceState = 'not_billed' | 'paid' | 'due' | 'overdue' | 'voided'

export interface CorporateSummary {
  readonly companyId: string
  readonly name: string
  readonly rcNumber: string | null
  readonly status: CompanyStatus
  readonly stage: OnboardingStage
  readonly accountManagerName: string | null
  readonly accountManagerEmail: string | null
  readonly seats: number
  readonly activeSeats: number
  readonly rides30d: number
  readonly spend30dMinor: number
  readonly currency: string
  readonly invoiceStatus: InvoiceState
  readonly invoiceOverdueDays: number
  readonly latestInvoiceId: string | null
  readonly signedAt: string | null
  readonly liveAt: string | null
  readonly blockedReason: string | null
  readonly blockedSince: string | null
  readonly attention: string | null
  readonly commissionRate: number
  readonly neverTravelled: number
}

export interface CorporateOverview {
  readonly liveAccounts: number
  readonly liveAccountsDelta30d: number
  readonly annualisedRevenueMinor: number
  readonly annualisedGrossMinor: number
  readonly currency: string
  readonly seatsBilled: number
  readonly seatsDelta30d: number
  readonly inOnboarding: number
  readonly oldestOnboardingDays: number
  readonly atRisk: number
  readonly overdueInvoices: number
  readonly needsAttention: readonly CorporateSummary[]
}

export interface CorporateDocument {
  readonly documentId: string
  readonly type: 'cac_certificate' | 'tin_certificate' | 'cac_status_report' | 'proof_of_address'
  readonly status: 'received' | 'accepted' | 'rejected'
  readonly fileName: string
  readonly sizeBytes: number
  readonly mediaType: string
  readonly uploadedAt: string
  readonly note: string | null
}

export interface CorporateVerification {
  readonly status: 'not_started' | 'in_progress' | 'submitted' | 'verified' | 'rejected'
  readonly submittedAt: string | null
  readonly decidedAt: string | null
  readonly decidedBy: string | null
  readonly rejectionReason: string | null
  readonly documents: readonly CorporateDocument[]
  readonly signatoryConfirmed: boolean
}

export interface CorporateContact {
  readonly employeeId: string
  readonly name: string | null
  readonly email: string
  readonly role: string
  readonly status: string
  readonly isApprover: boolean
}

export interface TimelineEntry {
  readonly entryId: string
  readonly kind: string
  readonly title: string
  readonly detail: string | null
  readonly actor: string
  readonly at: string
  readonly tone: 'neutral' | 'success' | 'warning' | 'danger'
}

export interface CorporateHealth {
  readonly seatUtilisationPct: number
  readonly activeSeats: number
  readonly seats: number
  readonly ridesPerActiveSeat: number
  readonly policyBreaches30d: number
  readonly invoicesOnTime: number
  readonly invoicesLate: number
  readonly renewalRisk: string
}

export interface CorporateOnboarding {
  readonly stage: OnboardingStage
  readonly companyDetailsDone: boolean
  readonly verificationDone: boolean
  readonly billingDone: boolean
  readonly employeesDone: boolean
  readonly policyDone: boolean
  readonly employeesInvited: number
  readonly employeesNeedingCostCentre: number
  readonly stageEnteredAt: string | null
  readonly blockedReason: string | null
  readonly waitingOn: 'orbit' | 'customer' | 'both' | 'none'
}

export interface CorporateDetail {
  readonly summary: CorporateSummary
  readonly legalName: string
  readonly tin: string | null
  readonly registeredAddress: string | null
  readonly industry: string | null
  readonly verifiedDomain: string | null
  readonly expectedSeatsMin: number | null
  readonly expectedSeatsMax: number | null
  readonly contractTerm: 'annual' | 'monthly'
  readonly contractRenewsAt: string | null
  readonly paymentTerms: 'invoice_net_30' | 'invoice_net_7' | 'card_on_file'
  readonly creditLimitMinor: number | null
  readonly billingContactName: string | null
  readonly billingEmail: string | null
  readonly poNumber: string | null
  readonly billingAddress: string | null
  readonly setupName: string | null
  readonly setupEmail: string | null
  readonly setupRole: string | null
  readonly setupPhone: string | null
  readonly verification: CorporateVerification
  readonly contacts: readonly CorporateContact[]
  readonly timeline: readonly TimelineEntry[]
  readonly health: CorporateHealth
  readonly onboarding: CorporateOnboarding
  readonly spendPrevious30dMinor: number
  readonly ridesPrevious30d: number
  readonly averageFare30dMinor: number
  readonly onboardingLinkSentAt: string | null
}

export interface OnboardingCard {
  readonly company: CorporateSummary
  readonly onboarding: CorporateOnboarding
  readonly daysInStage: number
  readonly daysSinceSigned: number
  readonly headline: string
}

export interface OnboardingBoard {
  readonly cards: readonly OnboardingCard[]
  readonly medianDaysToLive: number
  readonly targetDays: number
}

export interface NewCompany {
  readonly name: string
  readonly rcNumber: string
  readonly accountManagerName?: string
  readonly accountManagerEmail?: string
  readonly expectedSeatsMin?: number
  readonly expectedSeatsMax?: number
  readonly contractTerm: 'annual' | 'monthly'
  readonly setupName: string
  readonly setupEmail: string
  readonly commissionRate: number
  readonly paymentTerms: 'invoice_net_30' | 'invoice_net_7' | 'card_on_file'
  readonly creditLimitMinor?: number
  readonly sendLinkNow: boolean
}

export interface CorporateListFilters {
  readonly q: string | undefined
  readonly status: CompanyStatus | 'all'
}

const BASE = '/v1/admin/corporate'

export const corporateApi = {
  overview: () => api.get<CorporateOverview>(`${BASE}/overview`),

  list: (params: CorporateListFilters & { readonly cursor: string | undefined; readonly limit: number }) =>
    api.get<Page<CorporateSummary>>(BASE, {
      query: { q: params.q, status: params.status === 'all' ? undefined : params.status, cursor: params.cursor, limit: params.limit },
    }),

  get: (companyId: string) => api.get<CorporateDetail>(`${BASE}/${encodeURIComponent(companyId)}`),

  pipeline: (filter: string) => api.get<OnboardingBoard>(`${BASE}/pipeline`, { query: { filter } }),

  create: (body: NewCompany) => api.post<CorporateDetail>(BASE, { json: body, idempotencyKey: newIdempotencyKey() }),

  assignManager: (companyId: string, body: { readonly name: string; readonly email?: string }) =>
    api.post<CorporateDetail>(`${BASE}/${encodeURIComponent(companyId)}/manager`, { json: body, idempotencyKey: newIdempotencyKey() }),

  decide: (companyId: string, body: { readonly approved: boolean; readonly reason?: string; readonly rejectedDocumentIds?: readonly string[] }) =>
    api.post<CorporateDetail>(`${BASE}/${encodeURIComponent(companyId)}/verification`, { json: body, idempotencyKey: newIdempotencyKey() }),

  note: (companyId: string, note: string) =>
    api.post<CorporateDetail>(`${BASE}/${encodeURIComponent(companyId)}/notes`, { json: { note }, idempotencyKey: newIdempotencyKey() }),

  chase: (companyId: string, message?: string) =>
    api.post<CorporateDetail>(`${BASE}/${encodeURIComponent(companyId)}/chase`, { json: { message }, idempotencyKey: newIdempotencyKey() }),

  setStatus: (companyId: string, status: 'live' | 'at_risk' | 'churned', reason?: string) =>
    api.post<CorporateDetail>(`${BASE}/${encodeURIComponent(companyId)}/status`, { json: { status, reason }, idempotencyKey: newIdempotencyKey() }),

  resendLink: (companyId: string) =>
    api.post<CorporateDetail>(`${BASE}/${encodeURIComponent(companyId)}/resend-link`, { idempotencyKey: newIdempotencyKey() }),

  /**
   * Opens a verification document in a new tab.
   *
   * Fetched with the bearer token and handed to the browser as a blob URL, because a plain
   * link cannot carry the Authorization header and the gateway rightly refuses without it.
   */
  openDocument: async (companyId: string, documentId: string): Promise<void> => {
    const token = getAccessToken()
    const response = await fetch(`${API_BASE_URL}${BASE}/${encodeURIComponent(companyId)}/documents/${encodeURIComponent(documentId)}`, {
      headers: token === null ? {} : { Authorization: `Bearer ${token}` },
    })

    if (!response.ok) {
      throw new Error(`The document could not be opened (${String(response.status)}).`)
    }

    const url = URL.createObjectURL(await response.blob())
    window.open(url, '_blank', 'noopener')
    setTimeout(() => { URL.revokeObjectURL(url) }, 60_000)
  },
}

export const corporateKeys = {
  all: ['corporate'] as const,
  overview: () => ['corporate', 'overview'] as const,
  list: () => ['corporate', 'list'] as const,
  detail: (companyId: string) => ['corporate', 'detail', companyId] as const,
  pipeline: (filter: string) => ['corporate', 'pipeline', filter] as const,
}

// --- Presentation helpers shared by the three pages -------------------------------------

export const STATUS_LABEL: Record<CompanyStatus, string> = {
  draft: 'Draft',
  onboarding: 'Onboarding',
  live: 'Live',
  at_risk: 'At risk',
  churned: 'Churned',
}

export const STATUS_STYLE: Record<CompanyStatus, string> = {
  draft: 'bg-subtle text-fg-tertiary',
  onboarding: 'bg-warning-subtle text-fg-warning',
  live: 'bg-success-subtle text-fg-success',
  at_risk: 'bg-danger-subtle text-fg-danger',
  churned: 'bg-subtle text-fg-tertiary',
}

export const STAGE_LABEL: Record<OnboardingStage, string> = {
  signed: 'Signed',
  kyb_review: 'KYB review',
  billing_setup: 'Billing setup',
  employee_import: 'Employee import',
  policy_go_live: 'Policy & go-live',
  live: 'Live',
}

export const DOCUMENT_LABEL: Record<CorporateDocument['type'], string> = {
  cac_certificate: 'CAC certificate of incorporation',
  tin_certificate: 'TIN certificate',
  cac_status_report: 'CAC status report (CAC 7A)',
  proof_of_address: 'Proof of registered address',
}

export const PAYMENT_TERMS_LABEL: Record<CorporateDetail['paymentTerms'], string> = {
  invoice_net_30: 'Net 30 · invoiced monthly in arrears',
  invoice_net_7: 'Net 7 · invoiced monthly in arrears',
  card_on_file: 'Card on file · charged at month end',
}

/** ₦4.82M, ₦412M, ₦96,000 — the way the tiles abbreviate. */
export function compactMoney(minor: number, currency = 'NGN'): string {
  const major = minor / 100
  const symbol = currency === 'NGN' ? '₦' : `${currency} `
  const abs = Math.abs(major)

  if (abs >= 1_000_000_000) {
    return `${symbol}${(major / 1_000_000_000).toFixed(2).replace(/\.?0+$/, '')}B`
  }

  if (abs >= 1_000_000) {
    return `${symbol}${(major / 1_000_000).toFixed(2).replace(/\.?0+$/, '')}M`
  }

  return `${symbol}${major.toLocaleString('en-NG', { maximumFractionDigits: 0 })}`
}

export function daysAgo(iso: string | null): number | null {
  if (iso === null) {
    return null
  }

  return Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000))
}

export function shortDate(iso: string | null): string {
  return iso === null ? '—' : new Date(iso).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' })
}

export function monthYear(iso: string | null): string {
  return iso === null ? '—' : new Date(iso).toLocaleDateString('en-NG', { month: 'short', year: 'numeric' })
}
