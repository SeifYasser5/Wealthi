import { MAC_EPOCH_OFFSET_MS } from './constants'

export function macDateToJs(raw: unknown): Date {
  // better-sqlite3 returns oversized integers as BigInt when safeIntegers(true)
  const ns = typeof raw === 'bigint' ? raw : BigInt(raw as number)
  const ms = ns / 1_000_000n + MAC_EPOCH_OFFSET_MS
  return new Date(Number(ms))
}

/** Derives the "YYYY-MM" string from a message date using local time. */
export function toYearMonth(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  return `${y}-${m}`
}

/** First instant (local time) of a "YYYY-MM" month. */
export function startOfMonth(yearMonth: string): Date {
  const [y, m] = yearMonth.split('-').map(Number)
  return new Date(y, m - 1, 1)
}

/** Returns the inclusive list of "YYYY-MM" strings from start to end. */
export function monthRange(start: string, end: string): string[] {
  const [sy, sm] = start.split('-').map(Number)
  const [ey, em] = end.split('-').map(Number)
  const result: string[] = []
  let y = sy
  let m = sm
  while (y < ey || (y === ey && m <= em)) {
    result.push(`${y}-${String(m).padStart(2, '0')}`)
    if (m === 12) {
      y += 1
      m = 1
    } else {
      m += 1
    }
  }
  return result
}

/** Formats a Date as a local-time ISO-like string (no UTC offset). */
export function toLocalISO(date: Date): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return (
    `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}` +
    `T${p(date.getHours())}:${p(date.getMinutes())}:${p(date.getSeconds())}`
  )
}

// Avoids floating-point drift in the output (e.g. 0.1 + 0.2 → 0.30000000000000004)
export function round2(n: number): number {
  return Math.round(n * 100) / 100
}
