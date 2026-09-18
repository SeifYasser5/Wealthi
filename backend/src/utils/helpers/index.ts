import type { Request, Response } from 'express'
import { MAC_EPOCH_OFFSET_MS } from '../constants'

export function macDateToJs(raw: unknown): Date {
  // better-sqlite3 returns oversized integers as BigInt when safeIntegers(true)
  const ns = typeof raw === 'bigint' ? raw : BigInt(raw as number)
  const ms = ns / 1_000_000n + MAC_EPOCH_OFFSET_MS
  return new Date(Number(ms))
}

const YEAR_MONTH_RE = /^\d{4}-\d{2}$/

/** True when `value` is a "YYYY-MM" month string. */
export function isYearMonth(value: unknown): value is string {
  return typeof value === 'string' && YEAR_MONTH_RE.test(value)
}

/** Derives the "YYYY-MM" string from a message date using local time. */
export function toYearMonth(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  return `${y}-${m}`
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

// Avoids floating-point drift in the output (e.g. 0.1 + 0.2 → 0.30000000000000004)
export function round2(n: number): number {
  return Math.round(n * 100) / 100
}

/**
 * Wraps an async route handler so a rejection becomes a 500 with `onError`
 * instead of an unhandled promise rejection (Express 4 does not await handlers).
 * Every route that touches the DB needs this, so it lives here rather than
 * being repeated as a try/catch in each one.
 */
export function route(onError: string, handler: (req: Request, res: Response) => Promise<unknown>) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      await handler(req, res)
    } catch {
      res.status(500).json({ error: onError })
    }
  }
}
