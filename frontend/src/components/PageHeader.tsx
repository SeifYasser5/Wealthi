import type { ReactNode } from 'react'
import { MonthNavigator } from './MonthNavigator'

interface Props {
  title: string
  yearMonth: string
  onYearMonthChange: (yearMonth: string) => void
  /** Extra controls rendered under the title row, e.g. a filter bar. */
  children?: ReactNode
}

/** The title + month navigator every page opens with. */
export function PageHeader({ title, yearMonth, onYearMonthChange, children }: Props) {
  return (
    <header className="mb-8 space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold uppercase text-foreground">{title}</h1>
        <MonthNavigator yearMonth={yearMonth} onChange={onYearMonthChange} />
      </div>
      {children}
    </header>
  )
}
