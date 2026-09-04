import { Link, Outlet, useRouterState } from '@tanstack/react-router'

import { ThemeToggle } from '../components/ui/ThemeToggle'
import { cn } from '../components/ui/cn'

/**
 * Grouped navigation, not a flat list.
 *
 * The console spans four separate jobs — live dispatch, compliance, finance, platform
 * controls — and the people doing them are usually different people. A flat list of
 * nine links makes everyone scan past six things they never touch.
 */
const SECTIONS = [
  {
    label: 'Operations',
    items: [
      { to: '/', label: 'Live ops' },
      { to: '/rides', label: 'Rides' },
    ],
  },
  {
    label: 'Compliance',
    items: [
      { to: '/compliance', label: 'KYC queue' },
      { to: '/fraud', label: 'Fraud alerts' },
    ],
  },
  {
    label: 'Finance',
    items: [
      { to: '/ledger', label: 'Ledger' },
      { to: '/refunds', label: 'Refunds' },
    ],
  },
  {
    label: 'Growth',
    items: [{ to: '/leads', label: 'Leads' }],
  },
  {
    label: 'Platform',
    items: [
      { to: '/surge', label: 'Surge & zones' },
      { to: '/audit', label: 'Audit log' },
    ],
  },
] as const

export function AppShell() {
  const pathname = useRouterState({ select: (state) => state.location.pathname })

  return (
    <div className="flex min-h-screen bg-canvas">
      <nav aria-label="Main" className="w-56 shrink-0 border-r border-line-subtle bg-surface">
        <div className="flex h-14 items-center gap-2 px-4">
          <div className="size-6 rounded-full bg-brand" aria-hidden="true" />
          <span className="text-[15px] font-semibold">Orbit Ops</span>
        </div>

        {SECTIONS.map((section) => (
          <div key={section.label} className="px-2 py-2">
            <p className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wide text-fg-tertiary">
              {section.label}
            </p>

            <ul className="space-y-0.5">
              {section.items.map((item) => (
                <li key={item.to}>
                  <Link
                    to={item.to}
                    className={cn(
                      'block rounded-md px-3 py-1.5 text-[13px] font-medium transition-colors',
                      pathname === item.to
                        ? 'bg-brand-subtle text-fg-brand'
                        : 'text-fg-secondary hover:bg-hover hover:text-fg',
                    )}
                    aria-current={pathname === item.to ? 'page' : undefined}
                  >
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
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
