import { useQuery } from '@tanstack/react-query'
import { Link, Outlet, useNavigate, useRouterState } from '@tanstack/react-router'
import type { ReactNode } from 'react'

import { ThemeToggle } from '../components/ui/ThemeToggle'
import { cn } from '../components/ui/cn'
import { liveSnapshotQuery, type NavCounts } from '../features/liveops/snapshot'
import { clearSession, getAccessToken } from '../lib/auth/session'

/**
 * One flat list, in the order the work arrives.
 *
 * It was grouped under five headings — Operations, Compliance, Finance, Growth,
 * Platform — which reads well on a diagram and costs a scan on a screen: thirteen
 * destinations behind five labels means every jump is a two-step search, and the
 * headings never disambiguated anything because no two items shared a name. Flat, the
 * list is short enough to hold in the eye at once.
 *
 * Ordered by neighbour rather than by owning team: Leads sits under Corporate because
 * a lead becomes a corporate account, and Commissions under Payouts because both
 * answer "what did this cost us". The grouping survives without the headings.
 *
 * Each item carries an icon. Not decoration: an operator opening this console during an
 * incident wants one screen, and a column of eleven identical text labels is read word
 * by word. A shape is found in a glance.
 *
 * `count` names the field on the snapshot that fills the badge. A number sits beside a
 * section only when something is queued there — a badge showing 0 is a decoration that
 * trains people to stop reading badges.
 */
const NAV_ITEMS = [
  { to: '/', label: 'Live ops', icon: <NavigateIcon /> },
  { to: '/rides', label: 'Rides', icon: <CarIcon /> },
  { to: '/drivers', label: 'Drivers', icon: <PeopleIcon /> },
  { to: '/corporate', label: 'Corporate', icon: <BriefcaseIcon /> },
  { to: '/leads', label: 'Leads', icon: <SparkIcon /> },
  { to: '/compliance', label: 'Compliance', icon: <ShieldIcon />, count: 'complianceQueue' },
  { to: '/fraud', label: 'Fraud', icon: <AlertIcon />, count: 'fraudOpen' },
  { to: '/ledger', label: 'Ledger', icon: <ReceiptIcon /> },
  { to: '/payouts', label: 'Payouts', icon: <WalletIcon /> },
  { to: '/commissions', label: 'Commissions', icon: <SplitIcon /> },
  { to: '/surge', label: 'Surge & zones', icon: <BoltIcon /> },
  { to: '/incidents', label: 'Incidents', icon: <FlagIcon />, count: 'incidentsOpen' },
  { to: '/audit', label: 'Audit log', icon: <ChartIcon /> },
] as const satisfies readonly {
  to: string
  label: string
  icon: ReactNode
  count?: keyof NavCounts
}[]

export function AppShell() {
  const pathname = useRouterState({ select: (state) => state.location.pathname })
  const navigate = useNavigate()
  const identity = readIdentity()

  // The same query the board polls, read from cache. The badges cost no extra request.
  const { data: snapshot } = useQuery(liveSnapshotQuery)

  function signOut() {
    clearSession()
    void navigate({ to: '/sign-in' })
  }

  return (
    <div className="flex min-h-screen bg-canvas">
      <nav
        aria-label="Main"
        className="flex w-64 shrink-0 flex-col border-r border-line-subtle bg-surface"
      >
        {/* The same mark as the sign-in page and the public site. A different logo on the
            screen after sign-in reads as a different product. */}
        <div className="flex shrink-0 items-center gap-3 px-4 py-4">
          <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-brand text-[15px] font-semibold text-fg-on-brand">
            O
          </span>

          <div className="min-w-0">
            <p className="truncate text-[15px] font-semibold tracking-[-0.01em]">Orbit Backoffice</p>

            {/* Which platform this console is wired to, stated rather than assumed.
                Every destructive control in here — force-cancel, kill switch, refund —
                behaves identically against staging and against production, so the only
                thing standing between a rehearsal and a real cancellation is the
                operator knowing which one they are looking at. Amber because on the copy
                that matters it is a warning. */}
            <p className="tabular truncate text-[11px] leading-[14px] text-fg-warning">
              {ENVIRONMENT} · {MARKET}
            </p>
          </div>
        </div>

        <ul className="flex-1 space-y-0.5 overflow-y-auto px-2 pb-2">
          {NAV_ITEMS.map((item) => {
            const active = pathname === item.to
            const count = 'count' in item ? (snapshot?.counts[item.count] ?? null) : null

            return (
              <li key={item.to}>
                <Link
                  to={item.to}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'relative flex items-center gap-3 rounded-lg px-3 py-2 text-[14px] font-medium transition-colors',
                    active
                      ? 'bg-brand-subtle text-fg-brand'
                      : 'text-fg-secondary hover:bg-hover hover:text-fg',
                  )}
                >
                  {/* A rail, not colour alone. The active item has to survive being read
                      on a dimmed wall display and by somebody who cannot separate orange
                      from grey. */}
                  <span
                    aria-hidden
                    className={cn(
                      'absolute inset-y-1.5 left-0 w-0.5 rounded-full',
                      active ? 'bg-brand' : 'bg-transparent',
                    )}
                  />

                  <span aria-hidden className="shrink-0">
                    {item.icon}
                  </span>

                  <span className="min-w-0 flex-1 truncate">{item.label}</span>

                  {/* Zero is not shown. A queue that is empty should look empty. */}
                  {count !== null && count > 0 ? (
                    <span
                      className={cn(
                        'tabular shrink-0 text-[12px]',
                        active ? 'text-fg-brand' : 'text-fg-tertiary',
                      )}
                    >
                      {count}
                      <span className="sr-only"> waiting</span>
                    </span>
                  ) : null}
                </Link>
              </li>
            )
          })}
        </ul>

        {/* Who is signed in, and the way out. Both were missing: a console whose every
            action is recorded against a name never showed the name, and there was no
            sign-out anywhere in the application. */}
        <div className="shrink-0 border-t border-line-subtle p-3">
          {identity !== null && (
            <div className="flex items-center gap-2.5 px-1 py-1">
              <span
                aria-hidden
                className="grid size-7 shrink-0 place-items-center rounded-full bg-subtle text-[11px] font-semibold text-fg-secondary"
              >
                {initials(identity.role)}
              </span>

              <div className="min-w-0 flex-1">
                <p className="truncate text-[12px] font-medium text-fg">{identity.role}</p>
                <p className="truncate text-[11px] text-fg-tertiary" title={identity.subject}>
                  {identity.subject}
                </p>
              </div>
            </div>
          )}

          <button
            type="button"
            onClick={signOut}
            className="mt-1 flex w-full items-center gap-2 rounded-md px-1 py-1.5 text-[12px] font-medium text-fg-secondary transition-colors hover:bg-hover hover:text-fg"
          >
            <ExitIcon />
            Sign out
          </button>
        </div>
      </nav>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center justify-end gap-3 border-b border-line-subtle bg-surface px-6">
          <ThemeToggle />
        </header>

        <main className="min-w-0 flex-1 overflow-auto p-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}

/**
 * Which platform this build talks to.
 *
 * Read from build config rather than from the API, because the label has to be right
 * even when the API is the thing that is down — that is exactly the moment somebody is
 * about to act on the wrong console.
 */
const ENVIRONMENT = import.meta.env.VITE_ENVIRONMENT ?? 'local'
const MARKET = import.meta.env.VITE_MARKET ?? 'unset'

/**
 * Who the access token says is signed in.
 *
 * Read from the token rather than held in state, so it cannot disagree with the credential
 * actually being sent. The token carries a role and a subject but no email — showing an
 * address would mean asking identity for the profile, a request this shell does not
 * otherwise need to make.
 */
function readIdentity(): { role: string; subject: string } | null {
  const token = getAccessToken()

  if (token === null) {
    return null
  }

  try {
    const payload = token.split('.')[1]

    if (payload === undefined) {
      return null
    }

    // base64url, and atob wants padded base64.
    const padded = payload.padEnd(payload.length + ((4 - (payload.length % 4)) % 4), '=')
    const claims = JSON.parse(
      atob(padded.replaceAll('-', '+').replaceAll('_', '/')),
    ) as Record<string, unknown>

    const role = claims['http://schemas.microsoft.com/ws/2008/06/identity/claims/role']
    const subject = claims['sub']

    return {
      role: typeof role === 'string' ? capitalise(role) : 'Signed in',
      subject: typeof subject === 'string' ? subject : '',
    }
  } catch {
    // A malformed token is not worth breaking the shell over. The next API call rejects it
    // and lands the operator on sign-in with a real message.
    return null
  }
}

function capitalise(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1)
}

/** Up to two letters for the avatar. Empty rather than a placeholder glyph. */
function initials(value: string): string {
  return value
    .split(/\s+/)
    .filter((part) => part.length > 0)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('')
}

/** 16px, stroked, inheriting colour — one icon set that works in both themes. */
function Icon({ children }: { readonly children: ReactNode }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 16 16"
      className="size-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {children}
    </svg>
  )
}

function NavigateIcon() {
  return <Icon><path d="M14 2 2 6.9l5.1 2L9.1 14z" /></Icon>
}

function CarIcon() {
  return (
    <Icon>
      <path d="M2 10.5V8l1.4-3.2A1.5 1.5 0 0 1 4.8 4h6.4a1.5 1.5 0 0 1 1.4.8L14 8v2.5" />
      <path d="M2 10.5h12V12H2z" />
      <circle cx="4.5" cy="10.5" r="1" />
      <circle cx="11.5" cy="10.5" r="1" />
    </Icon>
  )
}

function PeopleIcon() {
  return (
    <Icon>
      <circle cx="6" cy="5.5" r="2.3" />
      <path d="M1.8 13.2a4.4 4.4 0 0 1 8.4 0" />
      <path d="M10.6 3.6a2.3 2.3 0 0 1 0 4.4M11.6 9.4a4.4 4.4 0 0 1 2.6 3.8" />
    </Icon>
  )
}

function BriefcaseIcon() {
  return (
    <Icon>
      <rect x="1.8" y="5" width="12.4" height="8.2" rx="1.2" />
      <path d="M5.6 5V3.8a1 1 0 0 1 1-1h2.8a1 1 0 0 1 1 1V5" />
      <path d="M1.8 8.6h12.4" />
    </Icon>
  )
}

function ShieldIcon() {
  return (
    <Icon>
      <path d="M8 1.5 13.5 4v4c0 3-2.4 5.5-5.5 6.5C4.9 13.5 2.5 11 2.5 8V4z" />
      <path d="m5.8 8 1.6 1.6L10.4 6.6" />
    </Icon>
  )
}

function AlertIcon() {
  return (
    <Icon>
      <path d="M8 2.2 14.5 13.5h-13z" />
      <path d="M8 6.5v3" />
      <circle cx="8" cy="11.6" r="0.3" fill="currentColor" />
    </Icon>
  )
}

function ReceiptIcon() {
  return (
    <Icon>
      <path d="M3.2 1.8h9.6v12.4l-1.6-1.1-1.6 1.1-1.6-1.1-1.6 1.1-1.6-1.1-1.6 1.1z" />
      <path d="M5.8 5.4h4.4M5.8 8.2h4.4" />
    </Icon>
  )
}

function WalletIcon() {
  return (
    <Icon>
      <rect x="1.8" y="3.4" width="12.4" height="9.2" rx="1.4" />
      <path d="M1.8 6.6h12.4" />
      <circle cx="11.4" cy="9.6" r="0.75" fill="currentColor" stroke="none" />
    </Icon>
  )
}

/** A fare splitting two ways — what a commission is. */
function SplitIcon() {
  return (
    <Icon>
      <path d="M2 8h3.5L8 4.5 10.5 11.5 13 8h1" />
      <circle cx="8" cy="8" r="6.5" />
    </Icon>
  )
}

function SparkIcon() {
  return <Icon><path d="M8 1.8 9.6 6l4.2 1.6L9.6 9.2 8 13.4 6.4 9.2 2.2 7.6 6.4 6z" /></Icon>
}

function BoltIcon() {
  return <Icon><path d="M9.2 1.5 3.4 9h3.6l-.6 5.5L12.6 7H9z" /></Icon>
}

function FlagIcon() {
  return (
    <Icon>
      <path d="M3.8 14.2V2" />
      <path d="M3.8 2.6h8.4l-1.8 3 1.8 3H3.8z" />
    </Icon>
  )
}

function ChartIcon() {
  return (
    <Icon>
      <path d="M2.4 13.4h11.2" />
      <path d="M4.6 13.4V7.2M8 13.4V3.4M11.4 13.4V9.4" />
    </Icon>
  )
}

function ExitIcon() {
  return (
    <Icon>
      <path d="M6 2.5H3.6A1.1 1.1 0 0 0 2.5 3.6v8.8a1.1 1.1 0 0 0 1.1 1.1H6" />
      <path d="M10 11 13.5 8 10 5M13.5 8H6" />
    </Icon>
  )
}
