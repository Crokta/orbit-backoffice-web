import { useMutation } from '@tanstack/react-query'
import { useNavigate, useSearch } from '@tanstack/react-router'
import { useState, type FormEvent } from 'react'

import { Button } from '../../components/ui/Button'
import { api } from '../../lib/api/client'
import { ApiError } from '../../lib/api/problem'
import { setSession } from '../../lib/auth/session'

interface SignInResponse {
  readonly accessToken: string
  readonly expiresIn: number
  readonly mfaRequired?: boolean
  readonly challengeId?: string
}

/**
 * Backoffice sign-in.
 *
 * Email and password, then MFA where the organisation requires it. The password is
 * never stored, never logged and never put in a query string — the last of those is
 * worth stating because a form that GETs instead of POSTs writes credentials into every
 * proxy log between here and the gateway.
 */
export function SignInPage() {
  const navigate = useNavigate()
  const search = useSearch({ strict: false }) as { redirect?: string }

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [challengeId, setChallengeId] = useState<string | null>(null)
  const [code, setCode] = useState('')

  const signIn = useMutation({
    mutationFn: (): Promise<SignInResponse> =>
      api.post<SignInResponse>('/v1/auth/sign-in', { json: { email, password } }),
    onSuccess: (result) => {
      if (result.mfaRequired === true && result.challengeId !== undefined) {
        setChallengeId(result.challengeId)
        return
      }

      setSession(result.accessToken, result.expiresIn)
      void navigate({ to: search.redirect ?? '/' })
    },
  })

  const verify = useMutation({
    mutationFn: (): Promise<SignInResponse> =>
      api.post<SignInResponse>('/v1/auth/mfa/verify', { json: { challengeId, code } }),
    onSuccess: (result) => {
      setSession(result.accessToken, result.expiresIn)
      void navigate({ to: search.redirect ?? '/' })
    },
  })

  const active = challengeId === null ? signIn : verify

  function onSubmit(event: FormEvent) {
    event.preventDefault()
    active.mutate()
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-canvas p-6">
      <form
        onSubmit={onSubmit}
        className="w-full max-w-sm space-y-4 rounded-xl border border-line-subtle bg-surface p-6 shadow-[var(--shadow-e2)]"
      >
        <div className="space-y-1">
          <div className="size-8 rounded-full bg-brand" aria-hidden="true" />
          <h1 className="text-[24px] font-semibold leading-[30px]">
            {challengeId === null ? 'Sign in to Orbit Ops' : 'Enter your verification code'}
          </h1>
          <p className="text-[13px] text-fg-secondary">
            {challengeId === null
              ? 'Operations accounts require a second factor.'
              : 'We sent a six-digit code to your authenticator app.'}
          </p>
        </div>

        {challengeId === null ? (
          <>
            <Field label="Work email" htmlFor="email">
              <input
                id="email"
                type="email"
                autoComplete="username"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className="h-10 w-full rounded-md border border-line bg-surface px-3 text-[15px]"
              />
            </Field>

            <Field label="Password" htmlFor="password">
              <input
                id="password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="h-10 w-full rounded-md border border-line bg-surface px-3 text-[15px]"
              />
            </Field>
          </>
        ) : (
          <Field label="Verification code" htmlFor="code">
            <input
              id="code"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              required
              value={code}
              onChange={(event) => setCode(event.target.value.replace(/\D/g, ''))}
              className="tabular h-12 w-full rounded-md border border-line bg-surface px-3 text-center text-[24px] tracking-[0.4em]"
            />
          </Field>
        )}

        {active.error !== null ? <ErrorNotice error={active.error} /> : null}

        <Button type="submit" size="lg" loading={active.isPending} className="w-full">
          {challengeId === null ? 'Sign in' : 'Verify'}
        </Button>
      </form>
    </div>
  )
}

function Field({
  label,
  htmlFor,
  children,
}: {
  readonly label: string
  readonly htmlFor: string
  readonly children: React.ReactNode
}) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={htmlFor} className="block text-[13px] font-medium text-fg-secondary">
        {label}
      </label>
      {children}
    </div>
  )
}

/**
 * Shows why a sign-in failed.
 *
 * Wrong password and unknown account produce the same message on purpose — the identity
 * service returns the same code for both, and distinguishing them here would hand an
 * attacker a way to enumerate which work addresses exist.
 */
function ErrorNotice({ error }: { readonly error: Error }) {
  const message =
    error instanceof ApiError && error.code === 'auth.account_locked'
      ? 'This account is locked. Your administrator can unlock it.'
      : error instanceof ApiError && error.status === 401
        ? 'That email and password do not match.'
        : 'Something went wrong. Please try again.'

  return (
    <p role="alert" className="rounded-md bg-danger-subtle px-3 py-2 text-[13px] text-fg-danger">
      {message}
    </p>
  )
}
