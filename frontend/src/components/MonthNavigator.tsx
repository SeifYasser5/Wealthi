import { ChevronLeft, ChevronRight } from 'lucide-react'
import { formatYearMonth, shiftYearMonth } from '../utils/utils'

interface Props {
  yearMonth: string
  onChange: (yearMonth: string) => void
}

const ARROW =
  'grid size-8 place-items-center rounded-full text-subtle transition-colors hover:bg-surface-hover hover:text-foreground focus-visible:outline-2 focus-visible:outline-primary'

export function MonthNavigator({ yearMonth, onChange }: Props) {
  return (
    <div className="flex items-center gap-1 rounded-full bg-surface p-1">
      <button
        type="button"
        aria-label="Previous month"
        onClick={() => onChange(shiftYearMonth(yearMonth, -1))}
        className={ARROW}
      >
        <ChevronLeft size={18} />
      </button>

      <h2 className="w-36 text-center text-sm font-semibold tabular-nums text-foreground">
        {formatYearMonth(yearMonth)}
      </h2>

      <button
        type="button"
        aria-label="Next month"
        onClick={() => onChange(shiftYearMonth(yearMonth, 1))}
        className={ARROW}
      >
        <ChevronRight size={18} />
      </button>
    </div>
  )
}
