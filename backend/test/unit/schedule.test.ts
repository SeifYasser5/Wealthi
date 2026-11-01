import { describe, expect, it } from 'vitest'
import {
  firstDayOnOrAfter,
  isDay,
  localDay,
  localMidnight,
  nextOccurrence,
  occurrences,
  stageSchedules,
  type Recurrence,
} from '../../src/utils/helpers/schedule'
import type { Minor } from '../../src/utils/money'
import type { StoredSchedule } from '../../src/utils/types'

const every = (frequency: Recurrence['frequency'], startDate: string, interval = 1, endDate: string | null = null) => ({
  frequency,
  interval,
  startDate,
  endDate,
})

describe('occurrences', () => {
  it('counts days from the start date', () => {
    expect(occurrences(every('daily', '2026-02-27'), '2026-03-02')).toEqual([
      '2026-02-27',
      '2026-02-28',
      '2026-03-01',
      '2026-03-02',
    ])
  })

  it('steps by the interval', () => {
    expect(occurrences(every('daily', '2026-01-01', 3), '2026-01-10')).toEqual([
      '2026-01-01',
      '2026-01-04',
      '2026-01-07',
      '2026-01-10',
    ])
    // The next one, 12 February, is a day past `through`.
    expect(occurrences(every('weekly', '2026-01-01', 2), '2026-02-11')).toEqual([
      '2026-01-01',
      '2026-01-15',
      '2026-01-29',
    ])
  })

  it('falls on the same weekday every week, across a year boundary', () => {
    expect(occurrences(every('weekly', '2025-12-24'), '2026-01-14')).toEqual([
      '2025-12-24',
      '2025-12-31',
      '2026-01-07',
      '2026-01-14',
    ])
  })

  it('keeps a monthly schedule on its day, clamping to a shorter month and coming back', () => {
    expect(occurrences(every('monthly', '2026-01-31'), '2026-05-31')).toEqual([
      '2026-01-31',
      '2026-02-28',
      '2026-03-31',
      '2026-04-30',
      '2026-05-31',
    ])
  })

  it('clamps to 29 February in a leap year', () => {
    expect(occurrences(every('monthly', '2028-01-30'), '2028-02-29')).toEqual(['2028-01-30', '2028-02-29'])
  })

  it('counts months across years, by the interval', () => {
    expect(occurrences(every('monthly', '2025-11-15', 2), '2026-05-15')).toEqual([
      '2025-11-15',
      '2026-01-15',
      '2026-03-15',
      '2026-05-15',
    ])
  })

  it('repeats yearly on the start day, 29 February falling back to the 28th', () => {
    expect(occurrences(every('yearly', '2024-02-29'), '2028-03-01')).toEqual([
      '2024-02-29',
      '2025-02-28',
      '2026-02-28',
      '2027-02-28',
      '2028-02-29',
    ])
    expect(occurrences(every('yearly', '2020-06-01', 3), '2026-06-01')).toEqual([
      '2020-06-01',
      '2023-06-01',
      '2026-06-01',
    ])
  })

  it('includes an occurrence on the last day, and none after it', () => {
    expect(occurrences(every('monthly', '2026-01-10'), '2026-03-09')).toEqual(['2026-01-10', '2026-02-10'])
    expect(occurrences(every('monthly', '2026-01-10'), '2026-03-10')).toEqual([
      '2026-01-10',
      '2026-02-10',
      '2026-03-10',
    ])
  })

  it('is empty before the start date', () => {
    expect(occurrences(every('daily', '2026-05-01'), '2026-04-30')).toEqual([])
  })

  it('stops at the end date, which may itself fall on an occurrence', () => {
    expect(occurrences(every('monthly', '2026-01-05', 1, '2026-03-05'), '2026-12-31')).toEqual([
      '2026-01-05',
      '2026-02-05',
      '2026-03-05',
    ])
    expect(occurrences(every('monthly', '2026-01-05', 1, '2026-03-04'), '2026-12-31')).toEqual([
      '2026-01-05',
      '2026-02-05',
    ])
  })

  it('stops at `through` when the end date is later', () => {
    expect(occurrences(every('daily', '2026-01-01', 1, '2026-12-31'), '2026-01-02')).toEqual([
      '2026-01-01',
      '2026-01-02',
    ])
  })
})

describe('nextOccurrence', () => {
  it('is the first occurrence after the given day, never on it', () => {
    expect(nextOccurrence(every('monthly', '2026-01-31'), '2026-02-10')).toBe('2026-02-28')
    expect(nextOccurrence(every('monthly', '2026-01-31'), '2026-02-28')).toBe('2026-03-31')
  })

  it('is the start date while it is still ahead', () => {
    expect(nextOccurrence(every('weekly', '2026-06-01'), '2026-05-01')).toBe('2026-06-01')
  })

  it('is null once the end date has passed, or no occurrence is left before it', () => {
    expect(nextOccurrence(every('monthly', '2026-01-05', 1, '2026-03-05'), '2026-03-05')).toBeNull()
    expect(nextOccurrence(every('monthly', '2026-01-05', 1, '2026-03-20'), '2026-03-05')).toBeNull()
  })

  it('may fall on the end date', () => {
    expect(nextOccurrence(every('monthly', '2026-01-05', 1, '2026-03-05'), '2026-03-04')).toBe('2026-03-05')
  })
})

describe('stageSchedules', () => {
  const rent: StoredSchedule = {
    id: 7,
    type: 'debit',
    amount: 150000 as Minor,
    currency: 'EGP',
    account: 'checking',
    merchant: 'RENT',
    categoryId: 3,
    ...every('monthly', '2026-01-01'),
  }

  it('stages one transaction per occurrence through today, marked with the schedule', () => {
    const staged = stageSchedules([rent], new Date(2026, 2, 15, 18))
    expect(staged.map((t) => t.yearMonth)).toEqual(['2026-01', '2026-02', '2026-03'])
    expect(staged[0]).toEqual({
      type: 'debit',
      amount: 150000,
      currency: 'EGP',
      account: 'checking',
      merchant: 'RENT',
      categoryId: 3,
      counterAccount: null,
      reportedBalance: null,
      transactedAt: new Date(2026, 0, 1),
      yearMonth: '2026-01',
      scheduleId: 7,
    })
  })

  it('adds today’s occurrence on its day, not before', () => {
    expect(stageSchedules([rent], new Date(2026, 1, 28, 23, 59))).toHaveLength(2)
    expect(stageSchedules([rent], new Date(2026, 2, 1, 0, 0))).toHaveLength(3)
  })

  it('stages every schedule', () => {
    const fee = { ...rent, id: 8, merchant: 'FEE', ...every('yearly', '2025-06-01') }
    expect(stageSchedules([rent, fee], new Date(2026, 0, 1)).map((t) => [t.scheduleId, t.merchant])).toEqual([
      [7, 'RENT'],
      [8, 'FEE'],
    ])
  })
})

describe('day helpers', () => {
  it('formats and parses local calendar days', () => {
    expect(localDay(new Date(2026, 0, 5, 23, 59))).toBe('2026-01-05')
    expect(localMidnight('2026-12-09')).toEqual(new Date(2026, 11, 9))
  })

  it.each(['2026-02-28', '2028-02-29', '2026-12-31'])('accepts the day %j', (day) => {
    expect(isDay(day)).toBe(true)
  })

  it.each(['2026-02-29', '2026-04-31', '2026-13-01', '2026-00-10', '2026-1-01', '2026-01-01x', 'x2026-01-01'])(
    'rejects %j',
    (day) => {
      expect(isDay(day)).toBe(false)
    },
  )
})

describe('firstDayOnOrAfter', () => {
  it('is the day in the start month when it has it', () => {
    expect(firstDayOnOrAfter('2026-03', 15)).toBe('2026-03-15')
    expect(firstDayOnOrAfter('2026-01', 31)).toBe('2026-01-31')
  })

  it('moves to the first later month that has the day', () => {
    expect(firstDayOnOrAfter('2026-02', 30)).toBe('2026-03-30')
    expect(firstDayOnOrAfter('2026-04', 31)).toBe('2026-05-31')
    expect(firstDayOnOrAfter('2026-11', 31)).toBe('2026-12-31')
    expect(firstDayOnOrAfter('2027-02', 29)).toBe('2027-03-29')
    expect(firstDayOnOrAfter('2028-02', 29)).toBe('2028-02-29')
  })
})
