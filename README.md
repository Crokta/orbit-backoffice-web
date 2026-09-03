# orbit-backoffice-web

The operations console. Live dispatch, compliance, finance and platform controls — built for people who are dealing with something going wrong.

|  |  |
|---|---|
| **Stack** | React 19 · TypeScript · Tailwind 4 · TanStack · Vite · pnpm |
| **Ports** | `5174` — Dev server |
| **Tests** | 23, all passing |
| **Technical reference** | [`docs/TECHNICAL.md`](docs/TECHNICAL.md) · [PDF](docs/orbit-backoffice-web-technical-reference.pdf) |

React 19 · TypeScript · Tailwind 4 · TanStack Query/Router/Table · Vite · pnpm.

Same stack and same design tokens as `orbit-enterprise-web`, and a different job. This one is
used by people who are dealing with something going wrong.

## Dark by default

Live-ops screens sit on wall displays in rooms that stay dim for hours. A white canvas at 3 a.m.
is the reason people turn the monitor away. The enterprise app defaults to light; this one does
not, and the toggle still works either way.

## Everything goes through the gateway

Including the admin BFF. There is no service URL anywhere in this codebase — operations
capabilities are the last surface that should have a second door.

## One call per page

The ride detail screen is assembled by the admin BFF from five services in a single request:
ride, rider, driver, payment, trace. Fanning out in the browser would mean five round trips over
whatever connection a support agent has and five chances for a partial render nobody planned.

**Sections that fail are named, not fatal.** A support agent looking at a ride during a payment
outage still sees the ride, the rider and the driver, with `unavailableSections` telling them
what they are not seeing. A page that fails wholesale because one upstream is slow is unavailable
exactly when a rider is on the phone.

A genuinely absent section — a ride with no payment yet — renders as "no payment yet" rather than
as an outage.

## Live ops polls, it does not hold a socket

Five-second polling. The gateway's WebSocket capacity is sized for riders and drivers —
hundreds of thousands of them — and spending connections on a handful of ops screens that are
happy with five-second-old numbers is the wrong trade (§5.3).

When polling fails the header **says so loudly**. A frozen dashboard that still looks healthy is
how a room spends twenty minutes acting on numbers from before the incident.

The median-match tile turns amber above the §3 target of 20 seconds, so the number that matters
is the one that changes colour.

## Every override records why

Force-cancel needs a reason of at least ten characters, and the reason is permanent and visible
in the audit log. An operator who has to type why they are overriding a ride state thinks about
it once more than one who does not.

The client-side minimum is a **courtesy, not the control** — the control is in the BFF's
aggregate, and a client that skips the check still cannot get past it.

Cancellation is the only terminal state operations can force. "Force complete" would mean
charging a rider for a trip nobody can prove happened, so the control does not exist. On a ride
that is already terminal the panel is not rendered at all rather than rendered and rejected.

## Four-eyes

Refunds above the threshold and every surge kill-switch change go to the approvals queue. The
approver cannot be the requester, and the UI says so plainly — being refused with no explanation
after typing a justification is a poor way to learn a rule.

Requests expire after 48 hours. A refund approved today and executed in two months is not the
decision anybody made.

## Fraud cases show their reasoning

Every case renders its contributing features with the plain-language description meant to be read
aloud to the driver. A decision that cannot be explained cannot be appealed, and an unappealable
automated suspension is exactly the failure mode §15.3 exists to prevent.

"Dismiss and lift" actually lifts the suspension. A queue where dismissing leaves the punishment
in place looks like due process and delivers none.

## The ledger is read-only

There is no route in this console that writes to it. Balances are derived from postings, never
stored, and a screen that could adjust one directly would break the property the whole payments
subsystem rests on (§12.1).

Debits and credits sit in separate columns, the way a ledger is read. One signed column forces
the reader to parse a minus sign on every row to work out which way the money went.

## Audit log

Read-only, with no route that writes or deletes. An endpoint that could add a record by hand
would make every record in the table arguable.

A **failed** privileged action is displayed as prominently as a successful one, with a danger
border. Somebody tried to force a state transition; that it did not work is not a reason to let
it blend in.

## Run it

```bash
cp .env.example .env.local
pnpm install
pnpm dev
```

Then http://localhost:5174.

| | |
|---|---|
| `pnpm dev` | Vite, proxying `/api` to the gateway |
| `pnpm build` | Typecheck, then production bundle |
| `pnpm test` | Vitest |
| `pnpm lint` | ESLint, type-aware |

## Container

Multistage; nginx as UID 64198, no build toolchain in the runtime image. See
`orbit-enterprise-web` for the details — the two are deliberately identical here.

## Tests

23, shared with the enterprise app where the code is shared. The interesting ones cover the
session and error-handling primitives every screen depends on.

---

## Further reading

| | |
|---|---|
| [`docs/TECHNICAL.md`](docs/TECHNICAL.md) | The full technical reference: architecture, domain model, design decisions, data model, API, events, flows, failure modes, configuration and testing |
| [`docs/orbit-backoffice-web-technical-reference.pdf`](docs/orbit-backoffice-web-technical-reference.pdf) | The same document, typeset |
| [`../README.md`](../README.md) | The platform: every service, how they fit together, and how to bring the whole thing up |
| [`../architecture.md`](../architecture.md) | The specification this was built from |

This repository is **independent**. It has its own git history, its own build and its own
deployment lifecycle; nothing above its root is inherited.
