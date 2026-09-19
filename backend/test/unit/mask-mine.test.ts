import { describe, expect, it } from 'vitest'
import { asciiDigits, escape, isPlaceholder, mask } from '../../src/services/patterns/mask'
import { messageCount, mineSequences, SLOT, type Sequence } from '../../src/services/patterns/mine'

describe('mask', () => {
  it('replaces every value type with its placeholder and splits glued punctuation', () => {
    expect(
      mask(
        'Card *1234 charged EGP 1,234.50 at ACME on 03-FEB-26 11:10 PM ref 55879c13. https://x.co/a bal.EGP383.80 (Cash)All @ATM',
      ),
    ).toEqual([
      'Card', '<MASKED>', 'charged', '<CUR>', '<NUM>', 'at', 'ACME', 'on', '<DATE>', '<TIME>', 'ref', '<ID>', '.',
      '<URL>', 'bal', '.', '<CUR>', '<NUM>', '(', 'Cash', ')', 'All', '@', 'ATM',
    ]) // prettier-ignore
  })

  it('handles Arabic text, Arabic-Indic digits and amount-before-currency', () => {
    expect(mask('خصم ١٢٣ جم من حساب')).toEqual(['خصم', '<NUM>', '<CUR>', 'من', 'حساب'])
    expect(mask('Paid 5.00 EGP')).toEqual(['Paid', '<NUM>', '<CUR>'])
  })

  it('recognises short dates, and d-d only when a time follows', () => {
    expect(mask('on 24/02 and 7/6')).toEqual(['on', '<DATE>', 'and', '<DATE>'])
    expect(mask('at 12-12 10:30')).toEqual(['at', '<DATE>', '<TIME>'])
    expect(mask('room 12-12')).toEqual(['room', '<NUM>', '-', '<NUM>'])
  })

  it('never lets literal "<WORD>" text pass for a placeholder', () => {
    expect(mask('code <NUM> here')).toEqual(['code', '<', 'NUM', '>', 'here'])
  })

  it('masks all masked-card shapes and space/comma-grouped numbers', () => {
    expect(mask('*1234 **1234 XXX123 1234**** **a08fdb1e')).toEqual(Array(5).fill('<MASKED>'))
    expect(mask('3 000.00 and 1,323,558 and -160.19')).toEqual(['<NUM>', 'and', '<NUM>', 'and', '<NUM>'])
  })

  it('keeps an all-letter or all-digit word out of <ID>', () => {
    expect(mask('ref ABCDEFG')).toEqual(['ref', 'ABCDEFG'])
    expect(mask('ref 123456')).toEqual(['ref', '<NUM>'])
  })
})

describe('mask helpers', () => {
  it('asciiDigits maps Arabic-Indic digits one for one', () => {
    expect(asciiDigits('٠١٢٣٤٥٦٧٨٩ x')).toBe('0123456789 x')
  })

  it('isPlaceholder and escape', () => {
    expect(isPlaceholder('<NUM>')).toBe(true)
    expect(isPlaceholder('<num>')).toBe(false)
    expect(isPlaceholder('NUM')).toBe(false)
    expect(new RegExp(`^${escape('a.b*(c)')}$`).test('a.b*(c)')).toBe(true)
  })
})

const seq = (text: string, count = 1): Sequence => ({ tokens: text.split(' '), count })

describe('mineSequences', () => {
  it('merges sequences that differ only in free text into one slot', () => {
    const [t, ...rest] = mineSequences([
      seq('Card <MASKED> charged <CUR> <NUM> at ACME', 3),
      seq('Card <MASKED> charged <CUR> <NUM> at CITY CAFE', 2),
      seq('Card <MASKED> charged <CUR> <NUM> at FUEL 12'),
    ])
    expect(rest).toEqual([])
    expect(t.elements).toEqual(['Card', '<MASKED>', 'charged', '<CUR>', '<NUM>', 'at', SLOT])
    expect(messageCount(t)).toBe(6)
  })

  it('keeps sequences with too little in common apart, most messages first', () => {
    const ts = mineSequences([seq('Your OTP is <NUM>'), seq('Card <MASKED> charged <CUR> <NUM> at ACME', 5)])
    expect(ts.map((t) => t.elements[0])).toEqual(['Card', 'Your'])
  })

  it('never lets a slot swallow an amount, date, time or URL', () => {
    const ts = mineSequences([seq('Paid <CUR> <NUM> to ACME today'), seq('Paid <CUR> <NUM> to ACME on <DATE> today')])
    expect(ts).toHaveLength(2)
  })

  it('never lets a slot swallow an account number after an account word', () => {
    const ts = mineSequences([
      seq('Paid <CUR> <NUM> to ACME from card <MASKED> ok'),
      seq('Paid <CUR> <NUM> to ACME from card ok'),
    ])
    expect(ts).toHaveLength(2)
  })

  it('lets a slot absorb a masked merchant id that is not an account', () => {
    const [t, ...rest] = mineSequences([
      seq('Paid <CUR> <NUM> at SHOP <MASKED> now'),
      seq('Paid <CUR> <NUM> at BIG STORE now'),
    ])
    expect(rest).toEqual([])
    expect(t.elements).toEqual(['Paid', '<CUR>', '<NUM>', 'at', SLOT, 'now'])
  })

  it('treats <NUM> and <ID> references as the same element', () => {
    const [t, ...rest] = mineSequences([
      seq('Paid <CUR> <NUM> ref <NUM> at ACME'),
      seq('Paid <CUR> <NUM> ref <ID> at BOOKS'),
    ])
    expect(rest).toEqual([])
    expect(t.elements).toContain('<ID>')
  })

  // Long enough that debit and credit messages share most literal words and merge first.
  const dir = (word: string, merchant: string) =>
    seq(`Dear customer your account <MASKED> was ${word} with <CUR> <NUM> at ${merchant}`)

  it('splits a slot whose edge word has only a few well-supported values into variants', () => {
    const ts = mineSequences([
      dir('debited', 'ACME'),
      dir('debited', 'CITY CAFE'),
      dir('credited', 'BOOK NOOK'),
      dir('credited', 'FUEL STATION'),
    ])
    expect(ts.map((t) => t.elements.join(' ')).sort()).toEqual([
      'Dear customer your account <MASKED> was credited with <CUR> <NUM> at <TEXT>',
      'Dear customer your account <MASKED> was debited with <CUR> <NUM> at <TEXT>',
    ])
  })

  it('does not split on a variant seen in only one sequence', () => {
    const ts = mineSequences([dir('debited', 'ACME'), dir('debited', 'CITY CAFE'), dir('credited', 'BOOK NOOK')])
    expect(ts.map((t) => t.elements.join(' '))).toEqual([
      'Dear customer your account <MASKED> was <TEXT> with <CUR> <NUM> at <TEXT>',
    ])
  })

  it('keeps short templates whose only shared words are too few apart', () => {
    const ts = mineSequences([
      seq('Account <MASKED> debited <CUR> <NUM> at ACME'),
      seq('Account <MASKED> credited <CUR> <NUM> at BOOK NOOK'),
    ])
    expect(ts).toHaveLength(2)
  })

  it('merges with up to four slots and refuses a fifth', () => {
    // Shared words dominate, so only the slot cap can keep these apart.
    const line = (n: number, tag: string) =>
      seq(Array.from({ length: n }, (_, i) => `k k k ${tag}${i}`).join(' ') + ' k k k')
    expect(mineSequences([line(4, 'a'), line(4, 'b')])).toHaveLength(1)
    expect(mineSequences([line(5, 'a'), line(5, 'b')])).toHaveLength(2)
  })

  it('returns nothing for nothing', () => {
    expect(mineSequences([])).toEqual([])
  })
})

describe('mask details', () => {
  it('masks every occurrence, case-insensitively where the bank varies case', () => {
    expect(mask('EGP 1 and EGP 2')).toEqual(['<CUR>', '<NUM>', 'and', '<CUR>', '<NUM>'])
    expect(mask('on 03-feb-26 and 04-FEB-26')).toEqual(['on', '<DATE>', 'and', '<DATE>'])
    expect(mask('at 10:30 and 11:45')).toEqual(['at', '<TIME>', 'and', '<TIME>'])
  })

  it('keeps AM/PM with the time whether or not a space separates them', () => {
    expect(mask('at 11:10PM ok')).toEqual(['at', '<TIME>', 'ok'])
    expect(mask('at 11:10 PM ok')).toEqual(['at', '<TIME>', 'ok'])
  })

  it('needs a digit and a letter anywhere in an <ID>', () => {
    expect(mask('ref AB12CD')).toEqual(['ref', '<ID>'])
    expect(mask('ref 12ABCD')).toEqual(['ref', '<ID>'])
  })

  it('peels punctuation off both ends of a word only', () => {
    expect(mask('(Cash).')).toEqual(['(', 'Cash', ')', '.'])
    expect(mask('a.b')).toEqual(['a.b'])
    expect(mask('x-ray.')).toEqual(['x-ray', '.'])
  })

  it('collapses runs of whitespace', () => {
    expect(mask('  Paid \t\n EGP   5  ')).toEqual(['Paid', '<CUR>', '<NUM>'])
  })

  it('keeps a real placeholder token intact when masking', () => {
    expect(mask('<b>')).toEqual(['<b>'])
  })
})

describe('mask helpers strictness', () => {
  it('isPlaceholder and PUNCT match whole tokens only', async () => {
    const { PUNCT } = await import('../../src/services/patterns/mask')
    expect(isPlaceholder('x<NUM>')).toBe(false)
    expect(isPlaceholder('<NUM>x')).toBe(false)
    expect(PUNCT.test('..')).toBe(true)
    expect(PUNCT.test('a.')).toBe(false)
    expect(PUNCT.test('.a')).toBe(false)
  })
})

// Cases found by mutation testing (npm run test:mutation).
describe('mineSequences rules', () => {
  const templates = (...seqs: Sequence[]) => mineSequences(seqs).map((t) => t.elements.join(' '))

  it.each(['<CUR> <NUM>', '<TIME>', '<URL>'])('never lets a slot swallow %s', (value) => {
    expect(
      templates(seq('Paid <CUR> <NUM> to ACME today'), seq(`Paid <CUR> <NUM> to ACME ${value} today`)),
    ).toHaveLength(2)
  })

  it.each(['pending', 'cardholder'])('treats a masked id after "%s" as free text, not an account', (word) => {
    expect(
      templates(seq(`Paid <CUR> <NUM> at SHOP ${word} <MASKED> now`), seq('Paid <CUR> <NUM> at BIG STORE now')),
    ).toEqual(['Paid <CUR> <NUM> at <TEXT> now'])
  })

  it('looks past punctuation for the account word before a masked id', () => {
    expect(
      templates(seq('Paid <CUR> <NUM> card : <MASKED> ok done'), seq('Paid <CUR> <NUM> card : ok done')),
    ).toHaveLength(2)
  })

  it('treats a masked id with nothing before it as an account', () => {
    expect(templates(seq('<MASKED> Paid <CUR> <NUM> at SHOP'), seq('Paid <CUR> <NUM> at SHOP'))).toHaveLength(2)
  })

  it('lets a slot absorb plain words after an account word', () => {
    expect(templates(seq('Paid <CUR> <NUM> card SHOP now'), seq('Paid <CUR> <NUM> card BIG STORE now'))).toEqual([
      'Paid <CUR> <NUM> card <TEXT> now',
    ])
  })

  it('only aligns <NUM> with <NUM> or <ID>, not with a word', () => {
    expect(templates(seq('Paid <CUR> <NUM> ref <NUM> at ACME'), seq('Paid <CUR> <NUM> ref XYZ at ACME'))).toEqual([
      'Paid <CUR> <NUM> ref <TEXT> at ACME',
    ])
  })

  it('opens a slot for words only the existing template has', () => {
    expect(templates(seq('Paid <CUR> <NUM> now ok', 3), seq('Paid <CUR> <NUM> ok'))).toEqual([
      'Paid <CUR> <NUM> <TEXT> ok',
    ])
  })

  it('merges at exactly 60% literal overlap', () => {
    expect(templates(seq('a b c <NUM>'), seq('a b c d e <NUM>'))).toEqual(['a b c <TEXT> <NUM>'])
  })

  it('merges sequences with exactly two literal words', () => {
    expect(templates(seq('a b <NUM>'), seq('a b c <NUM>'))).toEqual(['a b <TEXT> <NUM>'])
  })

  it('merges when exactly two literals match', () => {
    expect(templates(seq('a b <NUM> x'), seq('a b <NUM> y'))).toEqual(['a b <NUM> <TEXT>'])
  })

  it('keeps a sequence out of a template when its slot would swallow an account', () => {
    expect(
      templates(
        seq('Paid <CUR> <NUM> at SHOP now', 2),
        seq('Paid <CUR> <NUM> at BIG STORE now', 2),
        seq('Paid <CUR> <NUM> at card <MASKED> now'),
      ),
    ).toEqual(['Paid <CUR> <NUM> at <TEXT> now', 'Paid <CUR> <NUM> at card <MASKED> now'])
  })

  const variant = (merchant: string, word: string) =>
    seq(`Dear customer your account <MASKED> was ${word} with <CUR> <NUM> at ${merchant}`)

  it('splits into three variants, but not four', () => {
    // Every sequence has its own merchant, so only the direction word can form variants.
    let n = 0
    const both = (w: string) => [variant(`SHOP${++n}`, w), variant(`STORE${++n}`, w)]
    expect(templates(...['debited', 'credited', 'reversed'].flatMap(both))).toHaveLength(3)
    expect(templates(...['debited', 'credited', 'reversed', 'held'].flatMap(both))).toEqual([
      'Dear customer your account <MASKED> was <TEXT> with <CUR> <NUM> at <TEXT>',
    ])
  })

  it('splits on the last word of a slot when that is where the variants are', () => {
    const at = (merchant: string) => seq(`Card <MASKED> used at ${merchant} for <CUR> <NUM> today`)
    expect(templates(at('ACME ONLINE'), at('CITY ONLINE'), at('BOOK STORE'), at('FUEL STORE')).sort()).toEqual([
      'Card <MASKED> used at <TEXT> ONLINE for <CUR> <NUM> today',
      'Card <MASKED> used at <TEXT> STORE for <CUR> <NUM> today',
    ])
  })

  it('orders templates by total messages, not by their largest sequence', () => {
    expect(
      templates(
        seq('Your OTP is <NUM> now', 3),
        seq('Card <MASKED> charged <CUR> <NUM> at ACME'),
        seq('Card <MASKED> charged <CUR> <NUM> at CITY CAFE'),
        seq('Card <MASKED> charged <CUR> <NUM> at BOOK NOOK'),
        seq('Card <MASKED> charged <CUR> <NUM> at FUEL 12'),
      ),
    ).toEqual(['Card <MASKED> charged <CUR> <NUM> at <TEXT>', 'Your OTP is <NUM> now'])
  })
})
