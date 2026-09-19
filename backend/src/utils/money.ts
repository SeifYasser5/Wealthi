/**
 * Money in integer minor units (piastres, cents): 12.34 is 1234.
 *
 * Amounts are converted at the edges — parsed from text on the way in, turned
 * into a decimal string for Prisma, or a number for the API response on the way
 * out — and every sum in between is integer arithmetic, which is exact. The
 * DECIMAL(12,2) columns top out at 999 999 999 999 minor units, well inside
 * Number.MAX_SAFE_INTEGER.
 */

declare const minorUnits: unique symbol

/** An amount in integer minor units. Only this module's functions create one; elsewhere, cast a sum of Minors. */
export type Minor = number & { readonly [minorUnits]: true }

export type MinorResult = { ok: true; value: Minor } | { ok: false; error: string }

// An optional minus, whole units either plain or in groups of three separated
// by a comma or whitespace ("1,234", "1 234"), and an optional decimal part.
const AMOUNT = /^(-?)(\d{1,3}(?:[,\s]\d{3})+|\d+)(?:\.(\d+))?$/

/**
 * Parses a decimal amount such as "1,234.5" into minor units (123450) without
 * going through a float: the whole units and the fractional digits, padded to
 * two, are concatenated and read as one integer. Digits must be ASCII (callers
 * normalize Arabic-Indic digits first). Anything else is rejected rather than
 * coerced, including a third decimal place that isn't zero, which minor units
 * cannot hold.
 */
export function parseMinor(text: string): MinorResult {
  const m = AMOUNT.exec(text)
  if (!m) return { ok: false, error: `invalid amount "${text}"` }
  const [, sign, whole, fraction = ''] = m
  if (/[1-9]/.test(fraction.slice(2))) return { ok: false, error: `more than 2 decimal places in "${text}"` }
  const value = parseInt(whole.replace(/[,\s]/g, '') + fraction.slice(0, 2).padEnd(2, '0'), 10)
  if (!Number.isSafeInteger(value)) return { ok: false, error: `amount out of range "${text}"` }
  // `0 - value` rather than `-value` so "-0.00" is 0, not -0.
  return { ok: true, value: (sign ? 0 - value : value) as Minor }
}

/**
 * Minor units from a JSON number in the config file. The number's shortest
 * decimal form (what was written, e.g. 12.5 → "12.5") is parsed as text, so no
 * float arithmetic touches it.
 */
export function numberToMinor(n: number): MinorResult {
  return parseMinor(String(n))
}

/** The exact decimal string Prisma writes to a DECIMAL(12,2) column: 123450 → "1234.50". */
export function minorToDecimal(m: Minor): string {
  const digits = String(Math.abs(m)).padStart(3, '0')
  return `${m < 0 ? '-' : ''}${digits.slice(0, -2)}.${digits.slice(-2)}`
}

/**
 * Minor units from a DECIMAL(12,2) value as Prisma returns it. The column
 * guarantees the shape, so a failure here is a broken invariant and throws.
 */
export function decimalToMinor(d: { toFixed(dp: number): string }): Minor {
  const parsed = parseMinor(d.toFixed(2))
  if (!parsed.ok) throw new Error(`unexpected DECIMAL value: ${parsed.error}`)
  return parsed.value
}

/**
 * The number-shaped amount the API responds with: 123450 → 1234.5. One
 * correctly rounded division, the same float Number("1234.50") gives.
 */
export function minorToNumber(m: Minor): number {
  return m / 100
}
