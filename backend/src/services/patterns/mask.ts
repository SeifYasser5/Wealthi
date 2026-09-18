/**
 * Masking — replaces the values recognisable without knowing a template
 * (amounts, currencies, dates, card numbers, references) with typed
 * placeholders, and splits the rest into tokens. What stays literal is template
 * text plus free text (merchants, names), which mining tells apart.
 */

export type SlotType = 'URL' | 'MASKED' | 'CUR' | 'NUM' | 'DATE' | 'TIME' | 'ID'

const CURRENCY = String.raw`EGP|USD|EUR|جم|دولار`
// "3 000.00", "1,323,558", "5000.0", "-160.19". Space/comma groups must be exactly 3 digits.
const NUMBER = String.raw`-?\d{1,3}(?:[ ,]\d{3})+(?:\.\d+)?(?!\d)|-?\d+(?:\.\d+)?`
const MONTH = String.raw`JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC`
// Card/account numbers with masking: *1234, **1234, ***1234, XXX123, 1234****, **a08fdb1e
const MASKED_ID = String.raw`(?:\*+|X{2,})[\p{L}\p{N}]*\d[\p{L}\p{N}]*|\d{3,}\*{2,}`

/**
 * What each placeholder stands for in raw text, without the lookarounds masking
 * needs. Pattern slots compile to these.
 */
export const VALUE_PATTERNS: Record<SlotType | 'TEXT', string> = {
  URL: String.raw`https?:\/\/\S+`,
  MASKED: MASKED_ID,
  CUR: CURRENCY,
  NUM: NUMBER,
  DATE: String.raw`\d{1,2}[./-]\d{1,2}[./-]\d{2,4}|\d{1,2}-[A-Za-z]{3}-\d{2,4}|\d{1,2}[/-]\d{1,2}`,
  TIME: String.raw`\d{1,2}:\d{1,2}(?:\s?[AaPp][Mm])?`,
  // Mining aligns <ID> with <NUM> (all-digit references), so accept both.
  ID: String.raw`[A-Za-z0-9]+|${NUMBER}`,
  TEXT: '.*?',
}

/**
 * Ordered: earlier rules claim text first. Money before ID so "EGP383" isn't a
 * reference; dates before bare numbers so "24/02" isn't two numbers.
 */
const RULES: { replace: string; re: RegExp }[] = [
  { replace: '<URL>', re: /https?:\/\/\S+/giu },
  { replace: '<MASKED>', re: new RegExp(`(?:${MASKED_ID})`, 'gu') },
  { replace: '<CUR> <NUM>', re: new RegExp(String.raw`(?<![\p{L}])(?:${CURRENCY})\s*(?:${NUMBER})`, 'gu') },
  { replace: '<NUM> <CUR>', re: new RegExp(String.raw`(?<![\d.])(?:${NUMBER})\s*(?:${CURRENCY})(?![\p{L}])`, 'gu') },
  // 18.02.2024, 27/08/2024, 15-02-2024, 03-FEB-26
  {
    replace: '<DATE>',
    re: new RegExp(String.raw`(?<!\d)(?:\d{1,2}[./-]\d{1,2}[./-]\d{2,4}|\d{1,2}-(?:${MONTH})-\d{2,4})(?!\d)`, 'giu'),
  },
  // 11:10 PM, 0:57, 23:8 (some banks drop the minutes' leading zero)
  { replace: '<TIME>', re: /(?<!\d)\d{1,2}:\d{1,2}(?:\s?[AP]M)?(?!\d)/giu },
  // 24/02, 7/6, and "12-12" only when a time follows (bare d-d is too ambiguous)
  { replace: '<DATE>', re: /(?<![\d/])(?:\d{1,2}\/\d{1,2}|\d{1,2}-\d{1,2}(?=\s*<TIME))(?![\d/])/gu },
  // References: 6+ Latin alphanumerics mixing letters and digits (55879c13).
  // Latin only — Arabic text glues words to numbers ("المتاح87.01").
  { replace: '<ID>', re: /(?<![\p{L}\p{N}])(?=[A-Za-z]*\d)(?=\d*[A-Za-z])[A-Za-z0-9]{6,}(?![\p{L}\p{N}])/gu },
  { replace: '<NUM>', re: new RegExp(String.raw`(?<![\d.])(?:${NUMBER})`, 'gu') },
]

// Punctuation peeled off token edges so "ref 55879c13." and "ref 55879c13" match.
const EDGE_PUNCT = /^([,.;:()!?،–\-]*)(.*?)([,.;:()!?،–\-]*)$/u

/** A token that stands for a value rather than template text: <NUM>, <TEXT>, … */
export const isPlaceholder = (token: string) => /^<[A-Z]+>$/.test(token)

/** A token that is only punctuation. */
export const PUNCT = /^[,.;:()!?،–\-]+$/

/** Escapes a literal token for use inside a RegExp. */
export const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** Arabic-Indic digits → ASCII. One char for one char, so spacing and merchant text are untouched. */
export function asciiDigits(text: string): string {
  return text.replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
}

/** Masked token sequence of an SMS, e.g. ["charged", "with", "<CUR>", "<NUM>", "at", "ACME", "on", "<DATE>"]. */
export function mask(text: string): string[] {
  let masked = asciiDigits(text).replace(/\s+/g, ' ').trim()
  for (const { replace, re } of RULES) masked = masked.replace(re, ` ${replace} `)

  return (
    masked
      // Commas, @ and parentheses split anywhere: some banks glue text to the template
      // ("@ATM", "Branch,your", "(Cash)All").
      .replace(/([,،@()])/g, ' $1 ')
      .split(/\s+/)
      .flatMap((word) => {
        if (isPlaceholder(word)) return [word]
        const [, lead, core, trail] = word.match(EDGE_PUNCT)!
        return [...lead, core, ...trail]
      })
      .filter(Boolean)
  )
}
