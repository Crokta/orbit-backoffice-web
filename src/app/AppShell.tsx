import { Link, Outlet, useNavigate, useRouterState } from '@tanstack/react-router'
import type { ReactNode } from 'react'

import { ThemeToggle } from '../components/ui/ThemeToggle'
import { cn } from '../components/ui/cn'
import { clearSession, getAccessToken } from '../lib/auth/session'

/**
 * Grouped navigation, not a flat list.
 *
 * The console spans four separate jobs — live dispatch, compliance, finance, platform
 * controls — and the people doing them are usually different people. A flat list of
 * nine links makes everyone scan past six things they never touch.
 *
 * Each item carries an icon. Not decoration: an operator opening this console during an
 * incident wants one screen, and a column of nine identical text labels is read word by
 * word. A shape is found in a glance.
 */
const SECTIONS = [
  {
    label: 'Operations',
    items: [
      { to: '/', label: 'Live ops', icon: <PulseIcon /> },
      { to: '/rides', label: 'Rides', icon: <CarIcon /> },
    ],
  },
  {
    label: 'Compliance',
    items: [
      { to: '/compliance', label: 'KYC queue', icon: <BadgeIcon /> },
      { to: '/fraud', label: 'Fraud alerts', icon: <AlertIcon /> },
    ],
  },
  {
    label: 'Finance',
    items: [
      { to: '/ledger', label: 'Ledger', icon: <BookIcon /> },
      // Labelled for what the page is. It said "Refunds", and the page it opens is headed
      // "Approvals" — a nav label that disagrees with its own page costs a beat of doubt
      // every time, and doubt is expensive on the screens that move money.
      { to: '/refunds', label: 'Approvals', icon: <CheckIcon /> },
    ],
  },
  {
    label: 'Growth',
    items: [{ to: '/leads', label: 'Leads', icon: <SparkIcon /> }],
  },
  {
    label: 'Platform',
    items: [
      { to: '/surge', label: 'Surge & zones', icon: <MapIcon /> },
      { to: '/audit', label: 'Audit log', icon: <ListIcon /> },
    ],
  },
] as const

export function AppShell() {
  const pathname = useRouterState({ select: (state) => state.location.pathname })
  const navigate = useNavigate()
  const identity = readIdentity()

  function signOut() {
    clearSession()
    void navigate({ to: '/sign-in' })
  }

  return (
    <div className="flex min-h-screen bg-canvas">
      <nav
        aria-label="Main"
        className="flex w-56 shrink-0 flex-col border-r border-line-subtle bg-surface"
      >
        {/* The same mark as the sign-in page and the public site. A different logo on the
            screen after sign-in reads as a different product. */}
        <div className="flex h-14 shrink-0 items-center gap-2.5 px-4">
          <span className="grid size-7 place-items-center rounded-md bg-brand text-[13px] font-semibold text-fg-on-brand">
            O
          </span>
          <span className="text-[15px] font-semibold tracking-[-0.01em]">Orbit Ops</span>
        </div>

        <div className="flex-1 overflow-y-auto pb-2">
          {SECTIONS.map((section) => (
            <div key={section.label} className="px-2 py-2">
              <p className="px-3 pb-1.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-fg-tertiary">
                {section.label}
              </p>

              <ul className="space-y-0.5">
                {section.items.map((item) => {
                  const active = pathname === item.to

                  return (
                    <li key={item.to}>
                      <Link
                        to={item.to}
                        aria-current={active ? 'page' : undefined}
                        className={cn(
                          'relative flex items-center gap-2.5 rounded-md px-3 py-1.5 text-[13px] font-medium transition-colors',
                          active
                            ? 'bg-brand-subtle text-fg-brand'
                            : 'text-fg-secondary hover:bg-hover hover:text-fg',
                        )}
                      >
                        {/* A rail, not colour alone. The active item has to survive being
                            read on a dimmed wall display and by somebody who cannot
                            separate orange from grey. */}
                        <span
                          aria-hidden
                          className={cn(
                            'absolute inset-y-1 left-0 w-0.5 rounded-full',
                            active ? 'bg-brand' : 'bg-transparent',
                          )}
                        />
                        <span aria-hidden className="shrink-0 opacity-80">
                          {item.icon}
                        </span>
                        {item.label}
                      </Link>
                    </li>
                  )
                })}
              </ul>
            </div>
          ))}
        </div>

        {/* Who is signed in, and the way out. Both were missing: a console whose every
            action is recorded against a name never showed the name, and there was no
            sign-out anywhere in the application. */}
        <div className="shrink-0 border-t border-line-subtle p-3">
          {identity !== null && (
            <div className="mb-2 px-1">
              <p className="truncate text-[12px] font-medium text-fg">{identity.role}</p>
              <p className="truncate text-[11px] text-fg-tertiary" title={identity.subject}>
                {identity.subject}
              </p>
            </div>
          )}

          <button
            type="button"
            onClick={signOut}
            className="flex w-full items-center gap-2 rounded-md px-1 py-1.5 text-[12px] font-medium text-fg-secondary transition-colors hover:bg-hover hover:text-fg"
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

function PulseIcon() {
  return <Icon><path d="M1.5 8h3l2-4.5L9.5 12l2-4h3" /></Icon>
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

function BadgeIcon() {
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

function BookIcon() {
  return (
    <Icon>
      <path d="M2.5 3.2A1.2 1.2 0 0 1 3.7 2H13v10.5H3.7a1.2 1.2 0 0 0-1.2 1.2z" />
      <path d="M2.5 12.3A1.2 1.2 0 0 1 3.7 11H13" />
    </Icon>
  )
}

function CheckIcon() {
  return (
    <Icon>
      <circle cx="8" cy="8" r="6" />
      <path d="m5.4 8 1.9 1.9L10.8 6" />
    </Icon>
  )
}

function SparkIcon() {
  return <Icon><path d="M8 1.8 9.6 6l4.2 1.6L9.6 9.2 8 13.4 6.4 9.2 2.2 7.6 6.4 6z" /></Icon>
}

function MapIcon() {
  return (
    <Icon>
      <path d="M1.8 3.8 5.8 2.3v9.9L1.8 13.7z" />
      <path d="M5.8 2.3 10.2 3.9v9.9L5.8 12.2z" />
      <path d="M10.2 3.9l4-1.6v9.9l-4 1.6z" />
    </Icon>
  )
}

function ListIcon() {
  return (
    <Icon>
      <path d="M5.5 4h8M5.5 8h8M5.5 12h8" />
      <circle cx="2.6" cy="4" r="0.5" fill="currentColor" />
      <circle cx="2.6" cy="8" r="0.5" fill="currentColor" />
      <circle cx="2.6" cy="12" r="0.5" fill="currentColor" />
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
