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
        className="text-black transition hover:opacity-60"
      >
        <ChevronLeft size={24} />
      </button>

      <h2 className="w-48 text-center text-xl font-semibold uppercase text-black">{formatYearMonth(yearMonth)}</h2>

      <button
        type="button"
        aria-label="Next month"
        onClick={() => onChange(shiftYearMonth(yearMonth, 1))}
        className="text-black transition hover:opacity-60"
      >
        <ChevronRight size={24} />
      </button>
    </div>
  )
}
