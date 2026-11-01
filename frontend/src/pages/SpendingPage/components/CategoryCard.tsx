import { useState } from 'react'
import { ChevronDown } from 'lucide-react'
import type { CategoryRow, UncategorizedTransactionRow } from '@wealthi/shared'
import { money, plural } from '../../../utils/utils'
import { SpendingBar } from './SpendingBar'
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
    <div className="overflow-hidden rounded-2xl bg-surface">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center gap-4 px-5 py-4 text-left transition-colors hover:bg-surface-raised focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary"
      >
        <SpendingBar
          label={row.category}
          badge={`${pct.toFixed(1)}%`}
          amount={row.total}
          pct={pct}
          accent={isUncategorized ? 'muted' : 'primary'}
          footer={
            isUncategorized
              ? `${plural(uncategorized.length, 'transaction')} to categorize`
              : plural(row.merchants.length, 'merchant')
          }
        />
        <ChevronDown
          size={18}
          aria-hidden
          className={`shrink-0 text-muted transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open && (
        <div className="border-t border-line px-5 pb-4 pt-2">
          {/* Uncategorized expands to individual transactions — a category is set
              per transaction, so a merchant rollup would not be actionable here. */}
          {isUncategorized ? (
            <UncategorizedRows transactions={uncategorized} />
          ) : (
            <table className="w-full text-sm">
              <tbody>
                {row.merchants.map((m) => (
                  <tr key={m.merchant} className="border-b border-line last:border-0">
                    <td className="py-2 text-subtle">{m.merchant}</td>
                    <td className="py-2 text-right tabular-nums text-foreground">{money(m.total)}</td>
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
