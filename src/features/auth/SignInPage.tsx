import { useMutation } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { type SyntheticEvent, useState } from 'react'

import { Button } from '../../components/ui/Button'
import { cn } from '../../components/ui/cn'
import { api } from '../../lib/api/client'
import { ApiError } from '../../lib/api/problem'
import { deviceFingerprint, setSession } from '../../lib/auth/session'

interface TokenPair {
  readonly accessToken: string
  readonly refreshToken: string
  readonly familyId: string
  readonly expiresInSeconds: number
  readonly mustChangePassword?: boolean
}

/** Where in the flow we are. */
type Step = 'credentials' | 'change'

/**
 * Back-office sign-in.
 *
 * Email and password, on one screen. There was an emailed-code option here and it has been
 * removed: one-time codes are the mobile apps' business, where the phone number is the
 * account and a code is the only credential a rider has. An operator at a desk has a
 * password manager, and a console that mails a code on every sign-in adds a dependency on
 * mail being fast at exactly the moment it usually is not — during an incident.
 */
export function SignInPage() {
  const navigate = useNavigate()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [step, setStep] = useState<Step>('credentials')

  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')

  function land(result: TokenPair) {
    // The refresh grant goes with the token. Without it every reload landed back here:
    // identity issues no cookie, and a refresh with nothing to trade in is refused.
    setSession(result.accessToken, result.expiresInSeconds, { refreshToken: result.refreshToken, familyId: result.familyId })

    // A seeded or reset password gets one destination: the change screen. Letting an
    // operator postpone it is how an initial password becomes a permanent one.
    if (result.mustChangePassword === true) {
      setStep('change')
      return
    }

    goBackToWhereTheyWere()
  }

  const signIn = useMutation({
    mutationFn: (): Promise<TokenPair> =>
      // The fingerprint binds the refresh token to this browser; refresh without it is refused.
      api.post<TokenPair>('/v1/auth/password', { json: { email, password, deviceFingerprint: deviceFingerprint() } }),
    onSuccess: land,
  })

  const changePassword = useMutation({
    mutationFn: () =>
      api.post('/v1/account/credentials', {
        json: { currentPassword: password, newPassword },
      }),
    onSuccess: goBackToWhereTheyWere,
  })

  /**
   * Returns the operator to the page they were trying to reach.
   *
   * A support agent was sent a ride URL in a chat. Landing them on a dashboard after they
   * sign in loses the thing they were sent, and they have to go and ask for it again.
   */
  function goBackToWhereTheyWere() {
    const target = new URLSearchParams(window.location.search).get('redirect')
    void navigate({ to: target ?? '/' })
  }

  function submit(event: SyntheticEvent) {
    event.preventDefault()

    if (step === 'credentials') {
      signIn.mutate()
      return
    }

    changePassword.mutate()
  }

  const active = step === 'credentials' ? signIn : changePassword

  const mismatch = newPassword.length > 0 && confirmPassword.length > 0 && newPassword !== confirmPassword
  const tooShort = newPassword.length > 0 && newPassword.length < 12

  const blocked =
    step === 'change' && (mismatch || tooShort || newPassword.length === 0 || confirmPassword.length === 0)

  return (
    <div className="grid min-h-screen bg-canvas lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      <Aside />

      <main className="flex items-center justify-center px-6 py-16">
        <div className="w-full max-w-sm">
          <header className="mb-8">
            <h1 className="text-[26px] font-semibold leading-[32px] tracking-[-0.02em]">
              {step === 'change' ? 'Choose a new password' : 'Sign in'}
            </h1>
            <p className="mt-1.5 text-[13px] text-fg-secondary">
              {step === 'credentials' && 'Operations console for Orbit.'}
              {step === 'change' && 'Your password was set by somebody else. Replace it before continuing.'}
            </p>
          </header>

          <form onSubmit={submit} className="space-y-4">
            {step === 'credentials' && (
              <>
                <Field
                  id="email"
                  label="Work email"
                  type="email"
                  autoComplete="username"
                  placeholder="you@crokta.com"
                  value={email}
                  onChange={setEmail}
                  autoFocus
                />

                <Field
                  id="password"
                  label="Password"
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={setPassword}
                />
              </>
            )}

            {step === 'change' && (
              <>
                <Field
                  id="new-password"
                  label="New password"
                  type="password"
                  autoComplete="new-password"
                  hint="At least 12 characters. Length beats punctuation."
                  error={tooShort ? 'Too short — 12 characters minimum.' : undefined}
                  value={newPassword}
                  onChange={setNewPassword}
                  autoFocus
                />
                <Field
                  id="confirm-password"
                  label="Confirm it"
                  type="password"
                  autoComplete="new-password"
                  error={mismatch ? 'These do not match.' : undefined}
                  value={confirmPassword}
                  onChange={setConfirmPassword}
                />
              </>
            )}

            {active.isError && (
              <p role="alert" className="rounded-md bg-danger-subtle px-3 py-2.5 text-[13px] text-fg-danger">
                {active.error instanceof ApiError
                  ? active.error.message
                  : 'Something went wrong. Try again.'}
              </p>
            )}

            <Button type="submit" className="w-full" disabled={active.isPending || blocked}>
              {step === 'credentials' && (signIn.isPending ? 'Signing in…' : 'Sign in')}
              {step === 'change' && (changePassword.isPending ? 'Saving…' : 'Set password and continue')}
            </Button>
          </form>
        </div>
      </main>
    </div>
  )
}

function Field({
  id,
  label,
  value,
  onChange,
  hint,
  error,
  className,
  type,
  ...rest
}: {
  readonly id: string
  readonly label: string
  readonly value: string
  readonly onChange: (value: string) => void
  readonly hint?: string | undefined
  readonly error?: string | undefined
  readonly className?: string | undefined
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, 'id' | 'value' | 'onChange' | 'className'>) {
  const [revealed, setRevealed] = useState(false)

  // A password field is the one place a typo is invisible, and the cost of that typo is a
  // failed attempt against a lockout counter. The toggle is the field's own concern rather
  // than a separate component, so no password input in this console can be built without it.
  const isPassword = type === 'password'
  const resolvedType = isPassword && revealed ? 'text' : type

  const describedBy = [
    hint !== undefined ? `${id}-hint` : null,
    error !== undefined ? `${id}-error` : null,
  ].filter((value): value is string => value !== null)

  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-[13px] font-medium text-fg-secondary">
        {label}
      </label>

      <div className="relative">
        <input
          id={id}
          type={resolvedType}
          value={value}
          onChange={(event) => { onChange(event.target.value) }}
          required
          aria-invalid={error !== undefined}
          aria-describedby={describedBy.length > 0 ? describedBy.join(' ') : undefined}
          className={cn(
            'h-10 w-full rounded-md border bg-surface px-3 text-[13px] outline-none transition-colors',
            'focus:border-line-brand focus:ring-2 focus:ring-[color:var(--bg-brand)]/20',
            error === undefined ? 'border-line' : 'border-[color:var(--border-danger)]',
            isPassword && 'pr-10',
            className,
          )}
          {...rest}
        />

        {isPassword && (
          <button
            type="button"
            onClick={() => { setRevealed((current) => !current) }}
            // Not aria-pressed: this is not a toggle whose state the user tracks, it is a
            // control whose label states what it will do next. Screen readers read the
            // label, which changes, and that is the whole message.
            aria-label={revealed ? 'Hide password' : 'Show password'}
            aria-controls={id}
            className={cn(
              'absolute inset-y-0 right-0 grid w-10 place-items-center rounded-r-md',
              'text-fg-tertiary transition-colors hover:text-fg',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--bg-brand)]/40',
            )}
            // Excluded from tab order between the field and the submit button: someone
            // typing a password and pressing Tab expects the button they are about to
            // press, not a control they did not ask for. It stays reachable by click and
            // by shift-tabbing back.
            tabIndex={-1}
          >
            <EyeIcon closed={revealed} />
          </button>
        )}
      </div>

      {hint !== undefined && error === undefined && (
        <p id={`${id}-hint`} className="text-[11px] text-fg-tertiary">
          {hint}
        </p>
      )}

      {error !== undefined && (
        <p id={`${id}-error`} className="text-[11px] text-fg-danger">
          {error}
        </p>
      )}
    </div>
  )
}

/** Open eye when the password is hidden; struck through when it is showing. */
function EyeIcon({ closed }: { readonly closed: boolean }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 20 20"
      className="size-[18px]"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M1.8 10S4.9 4.6 10 4.6 18.2 10 18.2 10 15.1 15.4 10 15.4 1.8 10 1.8 10Z" />
      <circle cx="10" cy="10" r="2.4" />
      {closed && <path d="m3 17 14-14" />}
    </svg>
  )
}

/**
 * The left panel.
 *
 * Hidden below `lg`, where the form should have the whole screen. It exists to make the
 * console feel like part of the product rather than a bare form on white — and to say, in
 * one line, which system somebody is about to sign in to.
 */
function Aside() {
  return (
    <aside className="relative hidden overflow-hidden bg-inverse lg:flex lg:flex-col lg:justify-between lg:p-12">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.35]"
        style={{
          backgroundImage:
            'radial-gradient(ellipse 70% 55% at 20% 0%, var(--bg-brand) 0%, transparent 65%)',
        }}
      />

      <div className="relative flex items-center gap-2.5">
        <span className="grid size-7 place-items-center rounded-md bg-brand text-[13px] font-semibold text-fg-on-brand">
          O
        </span>
        <span className="text-[15px] font-semibold text-fg-inverse">Orbit</span>
      </div>

      <div className="relative">
        <p className="text-[28px] leading-[36px] font-semibold tracking-[-0.02em] text-fg-inverse">
          Operations console
        </p>
        <p className="mt-3 max-w-sm text-[14px] leading-[22px] text-fg-inverse/70">
          Live dispatch, compliance, finance and platform controls. Every privileged action
          here is recorded against your name.
        </p>
      </div>

      <p className="relative text-[12px] text-fg-inverse/50">
        Orbit is a product of Crokta Engineering Limited.
      </p>
    </aside>
  )
}
