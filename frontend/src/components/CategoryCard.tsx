import { useState } from 'react'
import type { CategoryRow, UncategorizedTransactionRow } from '@wealthi/shared'
import { money } from '../utils/utils'
import { UncategorizedRows } from './UncategorizedRows'

const UNCATEGORIZED = 'Uncategorized'

export function CategoryCard({
  row,
  grandTotal,
  uncategorized,
}: {
  row: CategoryRow
  grandTotal: number
  uncategorized: UncategorizedTransactionRow[]
}) {
  const [open, setOpen] = useState(false)
  const pct = grandTotal > 0 ? (row.total / grandTotal) * 100 : 0
  const isUncategorized = row.category === UNCATEGORIZED

  return (
    <div className="overflow-hidden rounded-2xl bg-[#f4f5f7]">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-4 px-5 py-4 text-left transition hover:bg-[#e9eaed]"
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <span className={`font-semibold ${isUncategorized ? 'text-[#9a9ba8]' : 'text-black'}`}>
                {row.category}
              </span>
              <span
                className={`shrink-0 rounded-md px-1.5 py-0.5 text-xs font-bold tabular-nums ${
                  isUncategorized ? 'bg-[#dde0e6] text-[#9a9ba8]' : 'bg-[#0666eb]/10 text-[#0666eb]'
                }`}
              >
                {pct.toFixed(1)}%
              </span>
            </div>
            <span className="shrink-0 font-mono text-sm font-medium text-[#6b6d80]">{money(row.total)}</span>
          </div>
          <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-[#dde0e6]">
            <div
              className={`h-full rounded-full transition-all ${isUncategorized ? 'bg-[#dde0e6]' : 'bg-[#0666eb]'}`}
              style={{ width: `${pct.toFixed(1)}%` }}
            />
          </div>
          <span className="mt-1 text-xs text-[#9a9ba8]">
            {isUncategorized ? (
              <>
                {uncategorized.length} transaction{uncategorized.length !== 1 ? 's' : ''} to categorize
              </>
            ) : (
              <>
                {row.merchants.length} merchant{row.merchants.length !== 1 ? 's' : ''}
              </>
            )}
          </span>
        </div>
        <span className="text-[#9a9ba8] text-sm">{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div className="border-t border-[#dde0e6] px-5 pb-4 pt-2">
          {/* Uncategorized expands to individual transactions — a category is set
              per transaction, so a merchant rollup would not be actionable here. */}
          {isUncategorized ? (
            <UncategorizedRows transactions={uncategorized} />
          ) : (
            <table className="w-full text-sm">
              <tbody>
                {row.merchants.map((m) => (
                  <tr key={m.merchant} className="border-b border-[#dde0e6] last:border-0">
                    <td className="py-1.5 text-[#6b6d80]">{m.merchant}</td>
                    <td className="py-1.5 text-right font-mono text-black">{money(m.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  )
}
