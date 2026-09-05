import { keepPreviousData, useQuery, type UseQueryResult } from '@tanstack/react-query'
import { useEffect, useMemo, useRef, useState } from 'react'

/** One page of a cursor-paged list, as every list endpoint returns it. */
export interface Page<T> {
  readonly items: readonly T[]
  readonly nextCursor: string | null
}

/** The page sizes a table offers. */
export const PAGE_SIZES = [25, 50, 100, 200] as const

export type PageSize = (typeof PAGE_SIZES)[number]

/**
 * A value that settles a moment after the user stops typing.
 *
 * Search boxes feed a server query. Sending one request per keystroke is a request per
 * letter of a driver's name, most of which are cancelled before they answer.
 */
export function useDebounced<T>(value: T, delayMs = 300): T {
  const [settled, setSettled] = useState(value)

  useEffect(() => {
    const timer = setTimeout(() => { setSettled(value) }, delayMs)
    return () => { clearTimeout(timer) }
  }, [value, delayMs])

  return settled
}

export interface PagedList<T> {
  readonly query: UseQueryResult<Page<T>>
  readonly items: readonly T[]
  /** 1-based, for the "Page N" label. */
  readonly pageNumber: number
  readonly hasPrevious: boolean
  readonly hasNext: boolean
  readonly next: () => void
  readonly previous: () => void
  readonly reset: () => void
  readonly limit: PageSize
  readonly setLimit: (limit: PageSize) => void
}

/**
 * Cursor paging for a table.
 *
 * The endpoints are keyset-paged — a list that is appended to while somebody reads it
 * would skip or repeat rows under an offset — so "back" is the cursor we came from rather
 * than page minus one. That is a stack, kept here, and it resets whenever the filters
 * change: page three of the old predicate means nothing against a new one.
 */
export function usePagedList<T, F extends object>({
  key,
  filters,
  fetchPage,
  initialLimit = 50,
  enabled = true,
  refetchInterval,
}: {
  readonly key: readonly unknown[]
  readonly filters: F
  readonly fetchPage: (params: F & { readonly cursor: string | undefined; readonly limit: number }) => Promise<Page<T>>
  readonly initialLimit?: PageSize
  readonly enabled?: boolean
  readonly refetchInterval?: number
}): PagedList<T> {
  const [cursors, setCursors] = useState<readonly string[]>([])
  const [limit, setLimit] = useState<PageSize>(initialLimit)

  // Compared by value, not identity: a filters object rebuilt on every render must not
  // reset the page on every render.
  const filterKey = JSON.stringify(filters)
  const lastFilterKey = useRef(filterKey)

  useEffect(() => {
    if (lastFilterKey.current !== filterKey) {
      lastFilterKey.current = filterKey
      setCursors([])
    }
  }, [filterKey])

  const cursor = cursors.at(-1)

  const query = useQuery<Page<T>>({
    queryKey: [...key, filterKey, cursor ?? '', limit],
    queryFn: () => fetchPage({ ...filters, cursor, limit }),
    // Keeps the previous page on screen while the next one loads. A table that blanks
    // between pages is one an operator loses their place in.
    placeholderData: keepPreviousData,
    enabled,
    ...(refetchInterval === undefined ? {} : { refetchInterval }),
  })

  return useMemo(
    () => ({
      query,
      items: query.data?.items ?? [],
      pageNumber: cursors.length + 1,
      hasPrevious: cursors.length > 0,
      hasNext: query.data?.nextCursor != null,
      next: () => {
        const nextCursor = query.data?.nextCursor
        if (nextCursor != null) {
          setCursors((stack) => [...stack, nextCursor])
        }
      },
      previous: () => { setCursors((stack) => stack.slice(0, -1)) },
      reset: () => { setCursors([]) },
      limit,
      setLimit: (size: PageSize) => {
        setLimit(size)
        setCursors([])
      },
    }),
    [query, cursors.length, limit],
  )
}

/** Turns a `yyyy-mm-dd` input value into the start or end of that day, as an ISO instant. */
export function dayBoundary(value: string, edge: 'start' | 'end'): string | undefined {
  if (value.length === 0) {
    return undefined
  }

  const date = new Date(`${value}T${edge === 'start' ? '00:00:00.000' : '23:59:59.999'}`)

  return Number.isNaN(date.getTime()) ? undefined : date.toISOString()
}
