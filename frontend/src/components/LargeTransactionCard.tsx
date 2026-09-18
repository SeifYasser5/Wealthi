import type { LargeTransactionRow } from '@wealthi/shared'
import { money } from '../utils/utils'
import { CategorySelect } from './CategorySelect'

export function LargeTransactionCard({ tx }: { tx: LargeTransactionRow }) {
  const label = tx.merchant ?? tx.account

  return (
    <div className="overflow-hidden rounded-2xl bg-[#f4f5f7]">
      <div className="flex w-full items-center gap-4 px-5 py-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-black">{label}</span>
              <span className="rounded-md bg-[#ff9500]/10 px-1.5 py-0.5 text-xs font-bold text-[#ff9500]">large</span>
            </div>
            <span className="shrink-0 font-mono text-sm font-medium text-[#6b6d80]">{money(tx.amount)}</span>
          </div>
          <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-[#dde0e6]">
            <div
              className="h-full rounded-full bg-[#ff9500] transition-all"
              style={{ width: `${tx.pct.toFixed(1)}%` }}
            />
          </div>
          <div className="mt-1 flex items-center justify-between gap-2">
            <span className="text-xs text-[#9a9ba8]">{tx.pct.toFixed(1)}% of total · single transaction</span>
            {/* Large rows are uncategorized by definition — they are listed here
                instead of inside the Uncategorized bucket, so the dropdown lives here. */}
            <CategorySelect transactionId={tx.id} />
          </div>
        </div>
      </div>
    </div>
  )
}
