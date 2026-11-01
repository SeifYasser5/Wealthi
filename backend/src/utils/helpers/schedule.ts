/**
 * When a schedule's occurrences fall, and the transactions they become.
 *
 * Dates are "YYYY-MM-DD" calendar days in local time, compared as strings
 * (the format sorts chronologically). Date arithmetic runs in UTC so a DST
 * change can never move a day; only the stored timestamp is local midnight,
 * so an occurrence lands in the month it is dated in (months are local time).
 */

import type { Frequency } from '@wealthi/shared'
import type { StagedTransaction, StoredSchedule } from '../types'
import { toYearMonth } from '.'

/** What decides when a schedule falls. */
export interface Recurrence {
  frequency: Frequency
  interval: number
  startDate: string
  endDate: string | null
}

const pad = (n: number) => String(n).padStart(2, '0')

/** A UTC Date's calendar day as "YYYY-MM-DD". */
function utcDay(date: Date): string {
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`
}

/** A local Date's calendar day as "YYYY-MM-DD". */
export function localDay(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

/** Midnight local time on a "YYYY-MM-DD" day. */
export function localMidnight(day: string): Date {
  const [y, m, d] = day.split('-').map(Number)
  return new Date(y, m - 1, d)
}

/** True when `day` is "YYYY-MM-DD" and a real calendar day (no 2026-02-30). */
export function isDay(day: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return false
  const [y, m, d] = day.split('-').map(Number)
  return utcDay(new Date(Date.UTC(y, m - 1, d))) === day
}

/**
 * Day `day` of the month `monthIndex` months after January of `year` (it may
 * overflow into later years), or that month's last day when it is shorter.
 */
function clampedDay(year: number, monthIndex: number, day: number): string {
  const lastDay = new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate()
  return utcDay(new Date(Date.UTC(year, monthIndex, Math.min(day, lastDay))))
}

/**
 * The n-th occurrence, from 0 (the start date). Monthly and yearly ones are
 * counted from the start date every time, never from the previous occurrence,
 * so a schedule on the 31st clamps to the 30th in April and is back on the
 * 31st in May.
 */
function nth({ frequency, interval, startDate }: Recurrence, n: number): string {
  const [y, m, d] = startDate.split('-').map(Number)
  const step = n * interval
  switch (frequency) {
    case 'daily':
      return utcDay(new Date(Date.UTC(y, m - 1, d + step)))
    case 'weekly':
      return utcDay(new Date(Date.UTC(y, m - 1, d + 7 * step)))
    case 'monthly':
      return clampedDay(y, m - 1 + step, d)
    case 'yearly':
      return clampedDay(y + step, m - 1, d)
  }
}

/** Every occurrence on or before `through` (and the end date), oldest first. */
export function occurrences(recurrence: Recurrence, through: string): string[] {
  const { endDate } = recurrence
  const last = endDate !== null && endDate < through ? endDate : through
  const days: string[] = []
  // Each occurrence is strictly later than the one before, so this ends.
  for (let n = 0; ; n++) {
    const day = nth(recurrence, n)
    if (day > last) return days
    days.push(day)
  }
}

/** The first occurrence after `after`, or null when the end date comes first. */
export function nextOccurrence(recurrence: Recurrence, after: string): string | null {
  const { endDate } = recurrence
  for (let n = 0; ; n++) {
    const day = nth(recurrence, n)
    if (endDate !== null && day > endDate) return null
    if (day > after) return day
  }
}

/**
 * One transaction per occurrence of every schedule, from its start date
 * through `now`'s day — each marked with its schedule's id. Like the manual
 * entries, they carry no bank-reported balance.
 */
export function stageSchedules(schedules: StoredSchedule[], now: Date): StagedTransaction[] {
  const today = localDay(now)
  return schedules.flatMap(({ id, frequency, interval, startDate, endDate, ...entry }) =>
    occurrences({ frequency, interval, startDate, endDate }, today).map((day) => {
      const transactedAt = localMidnight(day)
      return {
        ...entry,
        counterAccount: null,
        reportedBalance: null,
        transactedAt,
        yearMonth: toYearMonth(transactedAt),
        scheduleId: id,
      }
    }),
  )
}

/**
 * The first start date for a config `recurringTransactions` entry (monthly on
 * `dayOfMonth` from `startYearMonth`): its day in the first month from
 * `startYearMonth` that has it, so the 31st from February starts on 31 March.
 */
export function firstDayOnOrAfter(startYearMonth: string, dayOfMonth: number): string {
  const [y, m] = startYearMonth.split('-').map(Number)
  for (let k = 0; ; k++) {
    const day = clampedDay(y, m - 1 + k, dayOfMonth)
    if (Number(day.slice(8)) === dayOfMonth) return day
  }
}
