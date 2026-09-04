import { ApiError } from '../../lib/api/problem'

/**
 * What a page shows when the data it needs did not arrive.
 *
 * Every list page used to handle only two states — loading, and loaded-but-empty. A failed
 * request left `data` undefined, so `data?.length === 0` was falsy and `data?.map()`
 * rendered nothing: the page came up with its heading and a blank space under it, and an
 * operator had no way to tell a working empty queue from a broken one. During an incident
 * that is the difference between "nothing is wrong" and "we cannot see whether anything is
 * wrong".
 *
 * It names the failure and offers the retry, because the commonest cause is transient.
 */
export function LoadError({
  error,
  onRetry,
  what = 'this page',
}: {
  readonly error: unknown
  /** Usually a react-query `refetch`. */
  readonly onRetry?: (() => void) | undefined
  /** What could not be loaded, in a sentence: "the ride list". */
  readonly what?: string | undefined
}) {
  const detail =
    error instanceof ApiError
      ? error.status === 404
        ? 'The service does not offer this endpoint.'
        : error.message
      : 'The request did not complete.'

  return (
    <div
      role="alert"
      className="rounded-lg border border-line-subtle bg-surface p-8 text-center"
    >
      <p className="text-[13px] font-medium text-fg">Could not load {what}.</p>
      <p className="mt-1 text-[12px] text-fg-tertiary">{detail}</p>

      {onRetry !== undefined && (
        <button
          type="button"
          onClick={onRetry}
          className="mt-4 text-[12px] font-medium text-fg-brand hover:underline"
        >
          Try again
        </button>
      )}
    </div>
  )
}
