// Helpers for "YYYY-MM" strings used as the month cursor.

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
]

const YEAR_MONTH_RE = /^\d{4}-\d{2}$/

export function isYearMonth(value: string): boolean {
  return YEAR_MONTH_RE.test(value)
}

/** Current month in local time as "YYYY-MM". */
export function currentYearMonth(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

/** Shift a "YYYY-MM" string by a number of months (positive or negative). */
export function shiftYearMonth(yearMonth: string, delta: number): string {
  const [year, month] = yearMonth.split('-').map(Number)
  // month is 1-based here; Date handles overflow/underflow across years.
  const d = new Date(year, month - 1 + delta, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

/** "2026-06" -> "June 2026" for display. */
export function formatYearMonth(yearMonth: string): string {
  const [year, month] = yearMonth.split('-').map(Number)
  return `${MONTHS[month - 1]} ${year}`
}
