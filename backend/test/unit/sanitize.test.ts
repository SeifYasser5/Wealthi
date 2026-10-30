import { describe, expect, it } from 'vitest'
import { sanitizeMessageText } from '../../src/services/ingest/sanitize'

/**
 * What lands in `transactions.raw_text`: the readable message, with every
 * invisible character the decoder leaves behind taken out.
 */

describe('sanitizeMessageText', () => {
  it('leaves an already clean message untouched', () => {
    const text = 'Card *1111 charged EGP 25.00 at ACME GROCERS. Balance EGP 90.00'
    expect(sanitizeMessageText(text)).toBe(text)
  })

  it('strips the bidi marks that wrap an Arabic run', () => {
    // LRM / RLM / RLE / PDF / first-strong isolate around an Arabic word.
    const text = '\u200EBalance: \u200F\u202Bمبلغ\u202C\u2068 EGP 5.00\u2069'
    expect(sanitizeMessageText(text)).toBe('Balance: مبلغ EGP 5.00')
  })

  it('strips zero-width characters, the BOM and an attachment placeholder', () => {
    expect(sanitizeMessageText('\uFEFFEGP\u200B 5.00\uFFFC')).toBe('EGP 5.00')
  })

  it('drops the replacement character a failed decode leaves behind', () => {
    expect(sanitizeMessageText('EGP 5.00\uFFFD')).toBe('EGP 5.00')
  })

  it('strips stray control bytes the streamtyped path does not', () => {
    expect(sanitizeMessageText('\u0001EGP\u0007 5.00\u001F')).toBe('EGP 5.00')
  })

  it('folds NBSP and tabs into ordinary spaces and collapses runs', () => {
    expect(sanitizeMessageText('EGP\u00A0\u00A05.00\tat\u2003 \u3000ACME')).toBe('EGP 5.00 at ACME')
  })

  it('normalizes line breaks and trims each line, keeping the structure', () => {
    expect(sanitizeMessageText('\rDebit alert \r\n  EGP 5.00 \n\n\n\nBalance EGP 90.00\n\n')).toBe(
      'Debit alert\nEGP 5.00\n\nBalance EGP 90.00',
    )
  })

  it('returns an empty string for a body that was nothing but noise', () => {
    expect(sanitizeMessageText('\u0001\u200B\uFEFF \n ')).toBe('')
  })
})
