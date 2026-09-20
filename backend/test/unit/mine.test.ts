import { describe, expect, it } from 'vitest'
import { messageCount, mineSequences, SLOT, type Sequence } from '../../src/services/patterns/mine'

// mine.ts, the miner learn.ts runs: token-count buckets, widened across buckets,
// then variant splitting and rescue. Synthetic sequences only.

const seq = (text: string, count = 1): Sequence => ({ tokens: text.split(' '), count })
const shapes = (...seqs: Sequence[]) => mineSequences(seqs).map((t) => t.elements.join(' '))

describe('mineSequences: inside one bucket', () => {
  it('reads the slot off the positions where sequences of the same length differ', () => {
    const [t, ...rest] = mineSequences([
      seq('Card <MASKED> charged <CUR> <NUM> at ACME', 3),
      seq('Card <MASKED> charged <CUR> <NUM> at BOOKS', 2),
      seq('Card <MASKED> charged <CUR> <NUM> at FUEL'),
    ])
    expect(rest).toEqual([])
    expect(t.elements).toEqual(['Card', '<MASKED>', 'charged', '<CUR>', '<NUM>', 'at', SLOT])
    expect(messageCount(t)).toBe(6)
  })

  it('keeps sequences apart when the differences are two runs, not one', () => {
    // "note" sits between the two varying positions, so this is not one template.
    expect(
      shapes(
        seq('Card <MASKED> charged <CUR> <NUM> at ACME note fast'),
        seq('Card <MASKED> charged <CUR> <NUM> at BOOKS note slow'),
      ),
    ).toHaveLength(2)
  })

  it('treats <NUM> and <ID> references as the same element', () => {
    const [t] = mineSequences([seq('Paid <CUR> <NUM> ref <NUM> ok'), seq('Paid <CUR> <NUM> ref <ID> ok')])
    expect(t.elements).toEqual(['Paid', '<CUR>', '<NUM>', 'ref', '<ID>', 'ok'])
  })

  it('never lets a slot swallow an amount, date, time or URL', () => {
    expect(shapes(seq('Paid <CUR> <NUM> to ACME at <TIME>'), seq('Paid <CUR> <NUM> to BOOKS at <DATE>'))).toHaveLength(
      2,
    )
  })

  it('never lets a slot swallow an account number after an account word', () => {
    expect(
      shapes(seq('Paid <CUR> <NUM> from card <MASKED> now'), seq('Paid <CUR> <NUM> from card BOOKSTORE now')),
    ).toHaveLength(2)
  })

  it('never lets a slot swallow a masked value with no word in front of it', () => {
    expect(shapes(seq('<MASKED> , paid <CUR> <NUM> ok'), seq('BOOKSTORE , paid <CUR> <NUM> ok'))).toHaveLength(2)
  })

  it('looks past punctuation for the word in front of a masked value', () => {
    expect(
      shapes(seq('Paid <CUR> <NUM> from card , <MASKED> now'), seq('Paid <CUR> <NUM> from card , BOOKSTORE now')),
    ).toHaveLength(2)
  })

  it('lets a slot absorb a masked merchant id that is not an account', () => {
    const [t, ...rest] = mineSequences([seq('Paid <CUR> <NUM> at <MASKED> now'), seq('Paid <CUR> <NUM> at BOOKS now')])
    expect(rest).toEqual([])
    expect(t.elements).toEqual(['Paid', '<CUR>', '<NUM>', 'at', SLOT, 'now'])
  })

  it('refuses a slot that would cover more than half the message', () => {
    expect(shapes(seq('one two aaa bbb ccc'), seq('one two xxx yyy zzz'))).toHaveLength(2)
  })

  it('refuses a slot that would leave fewer than two literal words', () => {
    expect(shapes(seq('sent now <CUR> <NUM> ACME'), seq('sent now <CUR> <NUM> BOOKS'))).toEqual([
      'sent now <CUR> <NUM> <TEXT>',
    ])
    expect(shapes(seq('sent <CUR> <NUM> ACME'), seq('sent <CUR> <NUM> BOOKS'))).toHaveLength(2)
  })
})

describe('mineSequences: across buckets', () => {
  const charge = (merchant: string, count = 1) => seq(`Card <MASKED> charged <CUR> <NUM> at ${merchant} ok`, count)

  it('merges buckets whose slot is only a different number of tokens wide', () => {
    const [t, ...rest] = mineSequences([charge('ACME', 4), charge('CITY CAFE', 3), charge('BIG BOOK NOOK', 2)])
    expect(rest).toEqual([])
    expect(t.elements).toEqual(['Card', '<MASKED>', 'charged', '<CUR>', '<NUM>', 'at', SLOT, 'ok'])
    expect(messageCount(t)).toBe(9)
  })

  it('lets the slot match no tokens at all', () => {
    const [t, ...rest] = mineSequences([
      charge('ACME', 2),
      charge('CITY CAFE', 2),
      seq('Card <MASKED> charged <CUR> <NUM> at ok'),
    ])
    expect(rest).toEqual([])
    expect(t.elements).toContain(SLOT)
  })

  it('refuses to merge when both middles hold the same literal word', () => {
    // "ref" is a template word the merged slot would swallow, not a wider shop name.
    expect(
      shapes(
        seq('Account <MASKED> paid <CUR> <NUM> to ALICE ref <ID> now', 3),
        seq('Account <MASKED> paid <CUR> <NUM> for BIG SHOP ref QQ .', 2),
      ),
    ).toHaveLength(2)
  })
})

describe('mineSequences: variant splitting', () => {
  const dir = (word: string, merchant: string, count = 1) =>
    seq(`Account <MASKED> was ${word} <CUR> <NUM> at ${merchant} ok`, count)

  it('splits a slot whose edge word takes a few well-supported values', () => {
    expect(
      shapes(dir('debited', 'ACME'), dir('debited', 'CITY CAFE'), dir('credited', 'BOOKS'), dir('credited', 'FUEL')),
    ).toEqual(
      [
        'Account <MASKED> was debited <CUR> <NUM> at <TEXT> ok',
        'Account <MASKED> was credited <CUR> <NUM> at <TEXT> ok',
      ].sort((a, b) => a.localeCompare(b)),
    )
  })

  it('does not split on a value seen in only one sequence', () => {
    // "credited" is too thinly supported to split back out of the merged slot.
    expect(
      shapes(adjacent('debited', 'ACME', 2), adjacent('debited', 'BOOKS', 2), adjacent('credited', 'FUEL')),
    ).toEqual(['Account <MASKED> <TEXT> <CUR> <NUM> ok'])
  })

  // Adjacent to the merchant, so one bucket puts both words in the same slot and
  // only the split can tell the template word from the free text.
  const adjacent = (word: string, merchant: string, count = 1) =>
    seq(`Account <MASKED> ${word} ${merchant} <CUR> <NUM> ok`, count)

  it('splits a merged slot back into one template per direction word', () => {
    expect(
      shapes(
        adjacent('debited', 'ACME'),
        adjacent('debited', 'BOOKS'),
        adjacent('credited', 'FUEL'),
        adjacent('credited', 'CAFE'),
      ).sort((a, b) => a.localeCompare(b)),
    ).toEqual(['Account <MASKED> credited <TEXT> <CUR> <NUM> ok', 'Account <MASKED> debited <TEXT> <CUR> <NUM> ok'])
  })

  it('splits on the last word of a slot when the first word is free text', () => {
    const trailing = (merchant: string, word: string) => seq(`Account <MASKED> ${merchant} ${word} <CUR> <NUM> ok`)
    expect(
      shapes(
        trailing('ACME', 'debited'),
        trailing('BOOKS', 'debited'),
        trailing('FUEL', 'credited'),
        trailing('CAFE', 'credited'),
      ).sort((a, b) => a.localeCompare(b)),
    ).toEqual(['Account <MASKED> <TEXT> credited <CUR> <NUM> ok', 'Account <MASKED> <TEXT> debited <CUR> <NUM> ok'])
  })

  it('does not split a slot whose edge word is free text with many values', () => {
    const many = ['ACME', 'BOOKS', 'FUEL', 'CAFE', 'PHARMACY'].map((m) => dir('debited', m, 2))
    expect(shapes(...many)).toEqual(['Account <MASKED> was debited <CUR> <NUM> at <TEXT> ok'])
  })
})

describe('mineSequences: rescue', () => {
  const charge = (tail: string, count = 1) => seq(`Card <MASKED> charged <CUR> <NUM> at ${tail} ref <ID> .`, count)

  it('moves a template seen in too few shapes into a bigger template that covers it', () => {
    const [t, ...rest] = mineSequences([
      charge('ACME', 5),
      charge('CITY CAFE', 4),
      charge('BIG BOOK NOOK', 3),
      charge('ODD SHOP HERE NOW'),
    ])
    expect(rest).toEqual([])
    expect(t.elements).toEqual(['Card', '<MASKED>', 'charged', '<CUR>', '<NUM>', 'at', SLOT, 'ref', '<ID>', '.'])
    expect(messageCount(t)).toBe(13)
  })

  it('rescues by what the compiled pattern accepts, not by how masking marked it', () => {
    // An all-letter reference stays a literal token, and an <ID> slot still matches it.
    const [t, ...rest] = mineSequences([
      charge('ACME', 5),
      charge('CITY CAFE', 4),
      charge('BIG BOOK NOOK', 3),
      seq('Card <MASKED> charged <CUR> <NUM> at ODD SHOP ref bbadeaaf .'),
    ])
    expect(rest).toEqual([])
    expect(messageCount(t)).toBe(13)
  })

  it('leaves a small template alone when a bigger one only covers part of it', () => {
    // Same prefix and the same slot, but the last token differs, so the bigger
    // template's suffix doesn't cover this message.
    const ts = shapes(
      charge('ACME', 5),
      charge('CITY CAFE', 4),
      charge('BIG BOOK NOOK', 3),
      seq('Card <MASKED> charged <CUR> <NUM> at ODD SHOP ref <ID> !'),
    )
    expect(ts).toHaveLength(2)
    expect(ts.join('\n')).toContain('ODD SHOP')
  })

  it('leaves a small template alone when no bigger template covers it', () => {
    const ts = shapes(charge('ACME', 5), charge('CITY CAFE', 4), charge('BIG BOOK NOOK', 3), seq('Your OTP is <NUM>'))
    expect(ts).toContain('Your OTP is <NUM>')
  })

  it('never moves a template into one with no more messages than itself', () => {
    const ts = shapes(
      seq('Card <MASKED> charged <CUR> <NUM> at ACME ok'),
      seq('Card <MASKED> charged <CUR> <NUM> at BIG SHOP ok'),
    )
    expect(ts).toEqual(['Card <MASKED> charged <CUR> <NUM> at <TEXT> ok'])
  })
})

describe('mineSequences: output', () => {
  it('returns the most frequent template first', () => {
    const ts = mineSequences([seq('Your OTP is <NUM>'), seq('Card <MASKED> charged <CUR> <NUM> at ACME', 5)])
    expect(ts.map((t) => t.elements[0])).toEqual(['Card', 'Your'])
  })

  it('returns nothing for nothing', () => {
    expect(mineSequences([])).toEqual([])
  })
})
