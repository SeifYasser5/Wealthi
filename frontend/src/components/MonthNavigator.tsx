import { ChevronLeft, ChevronRight } from 'lucide-react'
import { formatYearMonth, shiftYearMonth } from '../utils/utils'

interface Props {
  yearMonth: string
  onChange: (yearMonth: string) => void
}

export function MonthNavigator({ yearMonth, onChange }: Props) {
  return (
    <div className="flex items-center justify-center gap-4">
      <button
        type="button"
        aria-label="Previous month"
        onClick={() => onChange(shiftYearMonth(yearMonth, -1))}
        className="text-foreground transition hover:text-subtle"
      >
        <ChevronLeft size={24} />
      </button>

      <h2 className="w-48 text-center text-xl font-semibold uppercase text-foreground">{formatYearMonth(yearMonth)}</h2>

      <button
        type="button"
        aria-label="Next month"
        onClick={() => onChange(shiftYearMonth(yearMonth, 1))}
        className="text-foreground transition hover:text-subtle"
      >
        <ChevronRight size={24} />
      </button>
    </div>
  )
}
