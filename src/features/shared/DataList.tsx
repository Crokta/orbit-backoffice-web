import { type ReactNode } from 'react'

import { Money } from '../../components/ui/Money'

/**
 * One column of a data list.
 *
 * A column is either `render` or `money`, never both. Amounts get right alignment and
 * tabular figures automatically, because a money column that someone forgot to align
 * is a column nobody can scan — and forgetting is the default when it is opt-in.
 */
export interface Column<T> {
  readonly key: string
  readonly header: string
  readonly render?: (row: T) => ReactNode
  readonly money?: (row: T) => readonly [number, string] | null
  readonly muted?: boolean
}

/**
 * The read-only table these consoles are mostly made of.
 *
 * Extracted because six pages of hand-written `<table>` markup drift: one forgets a
 * `scope`, another loses the empty state, a third right-aligns money and a fourth does
 * not. One implementation means fixing accessibility once.
 */
export function DataList<T>({
  title,
  columns,
  rows,
  isPending,
  rowKey,
  emptyMessage,
  actions,
}: {
  readonly title: string
  readonly columns: readonly Column<T>[]
  readonly rows: readonly T[] | undefined
  readonly isPending: boolean
  readonly rowKey: (row: T) => string
  readonly emptyMessage: string
  readonly actions?: ReactNode
}) {
  return (
    <div className="space-y-4">
      <header className="flex items-center justify-between">
        <h1 className="text-[28px] font-semibold leading-[34px]">{title}</h1>
        {actions}
      </header>

      <div className="overflow-x-auto rounded-lg border border-line-subtle bg-surface">
        <table className="w-full min-w-[720px] border-collapse text-[13px]">
          <thead>
            <tr className="border-b border-line-subtle">
              {columns.map((column) => (
                <th
                  key={column.key}
                  scope="col"
                  className={`px-4 py-3 text-[11px] font-semibold uppercase tracking-wide text-fg-tertiary ${
                    column.money === undefined ? 'text-left' : 'text-right'
                  }`}
                >
                  {column.header}
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {isPending ? (
              <StatusRow columns={columns.length} message="Loading…" />
            ) : rows === undefined || rows.length === 0 ? (
              <StatusRow columns={columns.length} message={emptyMessage} />
            ) : (
              rows.map((row) => (
                <tr key={rowKey(row)} className="border-b border-line-subtle last:border-0 hover:bg-hover">
                  {columns.map((column) => {
                    const amount = column.money?.(row)

                    return (
                      <td
                        key={column.key}
                        className={`px-4 py-3 ${column.money === undefined ? '' : 'text-right'} ${
                          column.muted === true ? 'text-fg-secondary' : ''
                        }`}
                      >
                        {column.money === undefined ? (
                          column.render?.(row)
                        ) : amount === null || amount === undefined ? (
                          // An em dash, not a zero. "No budget set" and "a budget of
                          // nothing" are different facts and must not look identical.
                          <span className="text-fg-tertiary">—</span>
                        ) : (
                          <Money minorUnits={amount[0]} currency={amount[1]} />
                        )}
                      </td>
                    )
                  })}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function StatusRow({ columns, message }: { readonly columns: number; readonly message: string }) {
  return (
    <tr>
      <td colSpan={columns} className="px-4 py-10 text-center text-fg-tertiary">
        {message}
      </td>
    </tr>
  )
}
