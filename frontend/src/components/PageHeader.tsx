import type { ReactNode } from 'react'
import { MonthNavigator } from './MonthNavigator'

interface Props {
  title: string
  yearMonth: string
  onYearMonthChange: (yearMonth: string) => void
  /** Extra controls rendered under the title row, e.g. a filter bar. */
  children?: ReactNode
  /** Rendered in the centre of the title row, e.g. view tabs. */
  center?: ReactNode
  /** Tighter spacing, for a page that wants the viewport for its content. */
  compact?: boolean
}

/** The title + month navigator every page opens with. */
export function PageHeader({ title, yearMonth, onYearMonthChange, children, center, compact }: Props) {
  return (
    <header className={compact ? 'mb-4 shrink-0 space-y-4' : 'mb-8 space-y-6'}>
      <div
        className={
          center
            ? 'grid grid-cols-[1fr_auto] items-end gap-4 md:grid-cols-[1fr_auto_1fr]'
            : 'flex flex-wrap items-end justify-between gap-4'
        }
      >
        <PageTitle>{title}</PageTitle>
        {center && (
          <div className="order-last col-span-2 flex justify-center md:order-none md:col-span-1">{center}</div>
        )}
        <div className="flex justify-end">
          <MonthNavigator yearMonth={yearMonth} onChange={onYearMonthChange} />
        </div>
      </div>
      {children}
    </header>
  )
}

/** The large title a page opens with, Apple style. */
export function PageTitle({ children }: { children: ReactNode }) {
  return <h1 className="text-4xl font-bold tracking-tight text-foreground">{children}</h1>
}
