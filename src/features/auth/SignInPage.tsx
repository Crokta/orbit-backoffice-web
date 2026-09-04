import { useMutation } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { type SyntheticEvent, useState } from 'react'

import { Button } from '../../components/ui/Button'
import { cn } from '../../components/ui/cn'
import { api } from '../../lib/api/client'
import { ApiError } from '../../lib/api/problem'
import { setSession } from '../../lib/auth/session'

interface TokenPair {
  readonly accessToken: string
  readonly expiresInSeconds: number
  readonly mustChangePassword?: boolean
}

interface OtpChallenge {
  readonly challengeId: string
  readonly expiresAt: string
  readonly resendAfterSeconds: number
}

/** Which credential the operator is presenting. */
type Method = 'token' | 'password'

/** Where in the flow we are. Email is always first. */
type Step = 'identify' | 'code' | 'password' | 'change'

/**
 * Back-office sign-in.
 *
 * Two ways in, on purpose. A one-time code is the better credential — nothing to reuse,
 * nothing to phish twice — but a console that only accepts a code locks its operator out
 * whenever mail is slow, and the moment that matters is during an incident. A password is
 * the way back in when the code will not arrive.
 *
 * The email address is asked for once, before the choice, because both methods need it and
 * asking twice is the sort of small friction that makes people write the password down.
 */
export function SignInPage() {
  const navigate = useNavigate()

  const [email, setEmail] = useState('')
  const [method, setMethod] = useState<Method>('token')
  const [step, setStep] = useState<Step>('identify')

  const [code, setCode] = useState('')
  const [password, setPassword] = useState('')
  const [challengeId, setChallengeId] = useState<string | null>(null)

  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')

  function land(result: TokenPair) {
    setSession(result.accessToken, result.expiresInSeconds)

    // A seeded or reset password gets one destination: the change screen. Letting an
    // operator postpone it is how an initial password becomes a permanent one.
    if (result.mustChangePassword === true) {
      setStep('change')
      return
    }

    goBackToWhereTheyWere()
  }

  const requestCode = useMutation({
    mutationFn: (): Promise<OtpChallenge> =>
      api.post<OtpChallenge>('/v1/auth/email/otp', { json: { email } }),
    onSuccess: (challenge) => {
      setChallengeId(challenge.challengeId)
      setStep('code')
    },
  })

  const verifyCode = useMutation({
    mutationFn: (): Promise<TokenPair> =>
      api.post<TokenPair>('/v1/auth/email/otp/verify', { json: { challengeId, code } }),
    onSuccess: land,
  })

  const signInWithPassword = useMutation({
    mutationFn: (): Promise<TokenPair> =>
      api.post<TokenPair>('/v1/auth/password', { json: { email, password } }),
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

    if (step === 'identify') {
      if (method === 'token') {
        requestCode.mutate()
      } else {
        setStep('password')
      }
      return
    }

    if (step === 'code') {
      verifyCode.mutate()
      return
    }

    if (step === 'password') {
      signInWithPassword.mutate()
      return
    }

    changePassword.mutate()
  }

  const active =
    step === 'identify'
      ? requestCode
      : step === 'code'
        ? verifyCode
        : step === 'password'
          ? signInWithPassword
          : changePassword

  const mismatch = newPassword.length > 0 && confirmPassword.length > 0 && newPassword !== confirmPassword

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
              {step === 'identify' && 'Operations console for Orbit.'}
              {step === 'code' && `We sent a six-digit code to ${email}.`}
              {step === 'password' && `Signing in as ${email}.`}
              {step === 'change' && 'Your password was set by somebody else. Replace it before continuing.'}
            </p>
          </header>

          <form onSubmit={submit} className="space-y-4">
            {step === 'identify' && (
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

                <MethodChoice value={method} onChange={setMethod} />
              </>
            )}

            {step === 'code' && (
              <Field
                id="code"
                label="Six-digit code"
                inputMode="numeric"
                autoComplete="one-time-code"
                placeholder="000000"
                value={code}
                onChange={(value) => { setCode(value.replace(/\D/g, '').slice(0, 6)) }}
                className="tabular text-center text-[20px] tracking-[0.5em]"
                autoFocus
              />
            )}

            {step === 'password' && (
              <Field
                id="password"
                label="Password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={setPassword}
                autoFocus
              />
            )}

            {step === 'change' && (
              <>
                <Field
                  id="new-password"
                  label="New password"
                  type="password"
                  autoComplete="new-password"
                  hint="At least 12 characters. Length beats punctuation."
                  value={newPassword}
                  onChange={setNewPassword}
                  autoFocus
                />
                <Field
                  id="confirm-password"
                  label="Confirm it"
                  type="password"
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={setConfirmPassword}
                  error={mismatch ? 'These do not match.' : undefined}
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

            <Button
              type="submit"
              className="w-full"
              disabled={active.isPending || (step === 'change' && (mismatch || newPassword.length === 0))}
            >
              {step === 'identify' && (method === 'token' ? 'Email me a code' : 'Continue')}
              {step === 'code' && 'Sign in'}
              {step === 'password' && 'Sign in'}
              {step === 'change' && 'Set password and continue'}
            </Button>

            {step === 'code' && (
              <Footnote
                onBack={() => { setStep('identify'); setCode('') }}
                onAlt={() => { requestCode.mutate() }}
                altLabel="Send another"
                disabled={requestCode.isPending}
              />
            )}

            {step === 'password' && (
              <Footnote
                onBack={() => { setStep('identify'); setPassword('') }}
                onAlt={() => { setMethod('token'); requestCode.mutate() }}
                altLabel="Email me a code instead"
                disabled={requestCode.isPending}
              />
            )}
          </form>
        </div>
      </main>
    </div>
  )
}

/**
 * The two ways in, as a segmented control.
 *
 * Presented side by side rather than as a link under the form. A password fallback hidden
 * behind "having trouble?" is found by the people who least need it and missed by the
 * person locked out at 3am, which is the only time it matters.
 */
function MethodChoice({
  value,
  onChange,
}: {
  readonly value: Method
  readonly onChange: (value: Method) => void
}) {
  const options = [
    { id: 'token' as const, label: 'Get a token', hint: 'A code by email. Nothing to remember.' },
    { id: 'password' as const, label: 'Use password', hint: 'For when mail is slow.' },
  ]

  return (
    <fieldset className="space-y-1.5">
      <legend className="mb-1.5 text-[13px] font-medium text-fg-secondary">How would you like to sign in?</legend>

      <div className="grid grid-cols-2 gap-2">
        {options.map((option) => (
          <button
            key={option.id}
            type="button"
            onClick={() => { onChange(option.id) }}
            aria-pressed={value === option.id}
            className={cn(
              'rounded-lg border p-3 text-left transition-colors',
              value === option.id
                ? 'border-line-brand bg-brand-subtle'
                : 'border-line-subtle bg-surface hover:bg-hover',
            )}
          >
            <span
              className={cn(
                'block text-[13px] font-medium',
                value === option.id ? 'text-fg-brand' : 'text-fg',
              )}
            >
              {option.label}
            </span>
            <span className="mt-0.5 block text-[11px] leading-[15px] text-fg-tertiary">
              {option.hint}
            </span>
          </button>
        ))}
      </div>
    </fieldset>
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
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-[13px] font-medium text-fg-secondary">
        {label}
      </label>

      <input
        id={id}
        value={value}
        onChange={(event) => { onChange(event.target.value) }}
        required
        aria-invalid={error !== undefined}
        aria-describedby={hint !== undefined ? `${id}-hint` : undefined}
        className={cn(
          'h-10 w-full rounded-md border bg-surface px-3 text-[13px] outline-none transition-colors',
          'focus:border-line-brand focus:ring-2 focus:ring-[color:var(--bg-brand)]/20',
          error === undefined ? 'border-line' : 'border-[color:var(--border-danger)]',
          className,
        )}
        {...rest}
      />

      {hint !== undefined && (
        <p id={`${id}-hint`} className="text-[11px] text-fg-tertiary">
          {hint}
        </p>
      )}

      {error !== undefined && <p className="text-[11px] text-fg-danger">{error}</p>}
    </div>
  )
}

function Footnote({
  onBack,
  onAlt,
  altLabel,
  disabled,
}: {
  readonly onBack: () => void
  readonly onAlt: () => void
  readonly altLabel: string
  readonly disabled: boolean
}) {
  return (
    <div className="flex items-center justify-between pt-1 text-[12px]">
      <button type="button" onClick={onBack} className="text-fg-tertiary hover:text-fg">
        Use a different email
      </button>
      <button
        type="button"
        onClick={onAlt}
        disabled={disabled}
        className="text-fg-brand hover:underline disabled:opacity-50"
      >
        {altLabel}
      </button>
    </div>
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
