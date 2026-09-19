import { describe, expect, it } from 'vitest'
import { learnBank } from '../../src/services/patterns/learn'
import type { DecodedMessage } from '../../src/utils/types'

// Labelling is exercised through learnBank (mask → mine → label), the way the
// CLI runs it, so each case reads as "these messages teach this pattern".

const MERCHANTS = ['ACME', 'CITY CAFE', 'BOOK NOOK', 'FUEL 12', 'PHARMACY PLUS']

const sms = (texts: string[]): DecodedMessage[] =>
  texts.map((text, i) => ({ rowid: BigInt(i), guid: `${i}`, messageDate: new Date(0), text, sender: 'B' }))

const learn = (texts: string[]) =>
  learnBank('b', sms(texts)).map(({ type, pattern, reason, review, messages }) => ({
    type,
    pattern,
    reason,
    review,
    messages,
  }))

const each = (f: (merchant: string, i: number) => string) => MERCHANTS.map(f)

describe('label: what is not a transaction', () => {
  it('drops declines, OTPs and other ignore-worthy templates', () => {
    expect(learn(each((m, i) => `Transaction of EGP ${i + 10}.00 at ${m} was declined on card *12${i}4`))).toEqual([])
    expect(learn(each((_, i) => `Your OTP for EGP ${i + 1}.00 debited is 12${i}4`))).toEqual([])
  })

  it('drops a template with no direction word', () => {
    expect(learn(each((m, i) => `Your statement for EGP ${i + 10}.00 at ${m} is ready *12${i}4`))).toEqual([])
  })

  it('drops a template with no amount', () => {
    expect(learn(each((m, i) => `Card *12${i}4 was debited at ${m}`))).toEqual([])
  })
})

describe('label: roles', () => {
  it('labels account, currency, amount and merchant from context', () => {
    expect(learn(each((m, i) => `Card *1234 charged EGP ${i + 1}.00 at ${m}`))).toEqual([
      {
        type: 'debit',
        pattern: 'Card {account:MASKED} charged {currency:CUR} {amount:NUM} at {merchant:TEXT}',
        reason: 'debit keyword in template text',
        review: undefined,
        messages: 5,
      },
    ])
  })

  it('pairs a currency with the number before it when none follows', () => {
    expect(learn(each((m, i) => `Charged ${i + 1}.00 EGP at ${m} on card *1234`))[0].pattern).toBe(
      'Charged {amount:NUM} {currency:CUR} at {merchant:TEXT} on card {account:MASKED}',
    )
  })

  it('labels counterparty, reference and a bare balance, and flags what it could not label', () => {
    const [p] = learn(
      each(
        (m, i) => `EGP ${i + 10}.00 sent from JOHN SMITH to ${m} ref ${i}AB${i}CD9 Available Balance is 1 03${i}.41`,
      ),
    )
    expect(p).toMatchObject({
      type: 'debit',
      // The constant name after "from" is turned back into a slot, not baked into the pattern.
      pattern:
        '{currency:CUR} {amount:NUM} sent from {counterparty:TEXT} to {:TEXT} ref {reference:ID} Available Balance is {balance:NUM}',
      review: ['no account slot', 'unlabelled TEXT slot #2'],
    })
  })

  it('labels a balance by the currency pair that follows a balance word', () => {
    const [p] = learn(each((m, i) => `Card *1234 charged EGP ${i + 1}.00 at ${m}. Available balance EGP ${900 - i}.00`))
    expect(p.pattern).toBe(
      'Card {account:MASKED} charged {currency:CUR} {amount:NUM} at {merchant:TEXT} . Available balance {:CUR} {balance:NUM}',
    )
  })

  it('labels account and reference from their values when no word says what they are', () => {
    const [p] = learn(
      ['101', '202', '303', '404', '505', '606'].map((r, i) => `Charged EGP ${i + 5}.00 on 1234 number ${r}9${i}7`),
    )
    expect(p.pattern).toBe('Charged {currency:CUR} {amount:NUM} on {account:NUM} number {reference:NUM}')
  })

  it('labels a free-text slot as the description when nothing else names the transaction', () => {
    const [p] = learn(each((m, i) => `Charged EGP ${i + 5}.00 on card *1234 (${m} purchase)`))
    expect(p.pattern).toBe(
      'Charged {currency:CUR} {amount:NUM} on card {account:MASKED} ( {description:TEXT} purchase )',
    )
  })

  it('labels text straight after a date as the merchant', () => {
    const [p] = learn(each((m, i) => `Spent EGP ${i + 5}.00 on 1${i}/02/2026 ${m} card *1234`))
    expect(p.pattern).toBe('Spent {currency:CUR} {amount:NUM} on {date:DATE} {merchant:TEXT} card {account:MASKED}')
  })

  it('labels date and time slots', () => {
    const [p] = learn(each((m, i) => `Card *1234 charged EGP ${i + 1}.00 at ${m} on 1${i}/02/2026 1${i}:30`))
    expect(p.pattern).toMatch(/on \{date:DATE\} \{time:TIME\}$/)
  })

  it('flags a template seen once', () => {
    expect(learn(['Refunded EGP 5.00 to card *1234 by SHOP'])).toEqual([
      {
        type: 'credit',
        pattern: 'Refunded {currency:CUR} {amount:NUM} to card {account:MASKED} by SHOP',
        reason: 'credit keyword in template text',
        review: ['seen once'],
        messages: 1,
      },
    ])
  })

  it('reads Arabic templates and Arabic-Indic digits', () => {
    const [p] = learn(each((m, i) => `تم خصم ${'١٢٣٤٥'[i]}٠ جم من بطاقة *1234 لدى ${m}`))
    expect(p).toMatchObject({ type: 'debit' })
    expect(p.pattern).toContain('{amount:NUM} {currency:CUR}')
    expect(p.pattern).toContain('{account:MASKED}')
  })
})

describe('label: direction', () => {
  it('learns a pattern per direction when the direction word varies', () => {
    const texts = [
      ...each((m, i) => `Account *1234 debited EGP ${i + 10}.00 at ${m}`),
      ...each((m, i) => `Account *1234 credited EGP ${i + 10}.00 at ${m}`),
    ]
    const types = learn(texts).map((p) => p.type)
    expect(types).toContain('debit')
    expect(types).toContain('credit')
  })

  it('learns a by-keyword pattern when the direction word sits inside free text', () => {
    const texts = [
      ...each((m, i) => `Account *1234 ${m} debited EGP ${i + 10}.00`),
      ...each((m, i) => `Account *1234 ${m} was credited EGP ${i + 10}.00`),
    ]
    const byKeyword = learn(texts).find((p) => p.type === 'by-keyword')
    expect(byKeyword).toMatchObject({ reason: 'direction word inside TEXT slot #1' })
    expect(byKeyword?.pattern).toContain('{direction:TEXT}')
  })

  // Known weakness in mining: the two messages whose merchant is a single word
  // ("ACME") cluster on their own, and label turns them into a third,
  // by-keyword pattern with the merchant baked in as literal text — so it only
  // ever matches that one merchant, and the debit/credit patterns each miss one
  // message. Remove `.fails` once it learns exactly one pattern per direction.
  it.fails('never bakes a merchant into a learned pattern', () => {
    const texts = [
      ...each((m, i) => `Account *1234 debited EGP ${i + 10}.00 at ${m}`),
      ...each((m, i) => `Account *1234 credited EGP ${i + 10}.00 at ${m}`),
    ]
    const patterns = learn(texts)
    expect(patterns.map((p) => p.pattern).join('\n')).not.toContain('ACME')
    expect(patterns.map((p) => [p.type, p.messages])).toEqual([
      ['debit', 5],
      ['credit', 5],
    ])
  })
})

describe('learnBank', () => {
  it('numbers ids when two templates hash the same', () => {
    // Identical masked templates can only collide via variant splitting; ids stay unique regardless.
    const ids = learnBank('b', sms([...each((m, i) => `Card *1234 charged EGP ${i}.00 at ${m}`)])).map((p) => p.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('keeps unrelated templates apart', () => {
    const patterns = learn([
      ...each((m, i) => `Card *1234 charged EGP ${i + 1}.00 at ${m}`),
      ...each((m, i) => `Account *5678 credited with USD ${i + 1}.00 from ${m} today`),
    ])
    expect(patterns.map((p) => p.pattern)).toEqual([
      'Card {account:MASKED} charged {currency:CUR} {amount:NUM} at {merchant:TEXT}',
      'Account {account:MASKED} credited with {currency:CUR} {amount:NUM} from {counterparty:TEXT} today',
    ])
  })
})

// Cases found by mutation testing (npm run test:mutation): each pins one rule of
// label.ts that a plausible edit could silently change.
describe('label: keyword words match whole words only', () => {
  const pattern = (texts: string[]) => learn(texts)[0].pattern

  it.each([
    ['Balances', 'a plural'],
    ['Unavailable', 'a longer word ending in "available"'],
  ])('"%s" (%s) is not a balance word', (word) => {
    expect(pattern(each((m, i) => `Card *1234 charged EGP ${i + 1}.00 at ${m}. ${word} EGP ${900 - i}.00`))).toContain(
      `${word} {:CUR} {:NUM}`,
    )
  })

  it.each(['accounts', 'subaccount'])('"%s" is not an account word', (word) => {
    expect(pattern(each((m, i) => `Charged EGP ${i + 1}.00 on ${word} 12345 at ${m}`))).toContain(`${word} {:NUM}`)
  })

  it('"account" before a number marks it as the account', () => {
    expect(pattern(each((m, i) => `Charged EGP ${i + 1}.00 on account 12345 at ${m}`))).toContain(
      'account {account:NUM}',
    )
  })

  it.each(['paid', 'refund'])('"%s" is not a reference word', (word) => {
    expect(pattern(each((m, i) => `Charged EGP ${i + 1}.00 ${word} 88123 at ${m} card *1234`))).toContain(
      `${word} {:NUM}`,
    )
  })

  it('"ref" marks a reference even when its value never changes, and a text slot too', () => {
    expect(pattern(each((m, i) => `Charged EGP ${i + 1}.00 ref 88123 at ${m} card *1234`))).toContain(
      'ref {reference:NUM}',
    )
    expect(pattern(each((m, i) => `Card *1234 charged EGP ${i + 1}.00 ref ${m}`))).toContain('ref {reference:TEXT}')
  })

  it.each(['flat', 'attn'])('"%s" is not a merchant word', (word) => {
    expect(pattern(each((m, i) => `Card *1234 charged EGP ${i + 1}.00 ${word} ${m}`))).toContain(
      `${word} {description:TEXT}`,
    )
  })

  it.each(['into', 'toward'])('"%s" is not a counterparty word', (word) => {
    expect(pattern(each((m, i) => `Card *1234 debited EGP ${i + 1}.00 ${word} ${m}`))).toContain(
      `${word} {description:TEXT}`,
    )
  })

  it('leaves a constant mixed-case name as literal text', () => {
    expect(pattern(each((m, i) => `Card *1234 debited EGP ${i + 1}.00 from Acme Corp at ${m}`))).toContain(
      'from Acme Corp at {merchant:TEXT}',
    )
  })
})

describe('label: how far it looks for a keyword', () => {
  const pattern = (texts: string[]) => learn(texts)[0].pattern

  it('sees a keyword that is the very first word', () => {
    expect(pattern(each((m, i) => `Balance EGP ${900 - i}.00 after EGP ${i + 1}.00 debited at ${m} card *1234`))).toBe(
      'Balance {:CUR} {balance:NUM} after {currency:CUR} {amount:NUM} debited at {merchant:TEXT} card {account:MASKED}',
    )
  })

  it('sees a date that is the very first element', () => {
    expect(
      learn(each((m, i) => `1${i}/02/2026 ${m} debited EGP ${i + 1}.00 card *1234`)).map((p) => p.pattern),
    ).toContain('{date:DATE} {merchant:TEXT} debited {currency:CUR} {amount:NUM} card {account:MASKED}')
  })

  it('looks at most four words back, not five', () => {
    expect(
      pattern(
        each((m, i) => `Card *1234 debited EGP ${i + 1}.00 at ${m} . Available for you to use EGP ${900 - i}.00`),
      ),
    ).toContain('Available for you to use {:CUR} {:NUM}')
  })

  it('does not count punctuation as words', () => {
    expect(
      pattern(
        each(
          (m, i) => `Card *1234 debited EGP ${i + 1}.00 at ${m} . Available balance ( after fees ) : EGP ${900 - i}.00`,
        ),
      ),
    ).toContain(': {:CUR} {balance:NUM}')
  })

  it('stops at the previous value', () => {
    expect(pattern(each((m, i) => `Available balance card *1234 charged EGP ${i + 1}.00 at ${m}`))).toContain(
      'charged {currency:CUR} {amount:NUM}',
    )
  })
})

describe('label: roles from values', () => {
  const pattern = (texts: string[]) => learn(texts)[0].pattern

  it('never gives a free-text role to an id-like value', () => {
    const refs = ['AB12CD9', 'XY98ZT7', 'QW45ER1', 'PL09OK2', 'MN34BV8']
    expect(pattern(refs.map((r, i) => `Card *1234 charged EGP ${i + 1}.00 at ${r}`))).toContain('at {reference:ID}')
  })

  it('leaves a second amount next to a currency alone', () => {
    expect(
      pattern(each((m, i) => `Card *1234 charged EGP ${i + 1}.00 at ${m} installment EGP ${i + 50}.00`)),
    ).toContain('installment {:CUR} {:NUM}')
  })

  it('only calls a whole 3–4 digit value an account number', () => {
    expect(pattern(each((m, i) => `Charged EGP ${i + 1}.00 code 1,234 at ${m}`))).toContain('code {:NUM}')
  })

  it('calls a value with up to three distinct 4-digit values an account, but not four', () => {
    const three = ['1111', '2222', '3333', '1111', '2222', '3333']
    const four = ['1111', '2222', '3333', '4444', '1111', '2222']
    const shop = (i: number) => `SHOP${'ABCDEF'[i]}X`
    expect(pattern(three.map((a, i) => `Charged EGP ${i + 1}.00 on ${a} at ${shop(i)}`))).toContain('on {account:NUM}')
    expect(pattern(four.map((a, i) => `Charged EGP ${i + 1}.00 on ${a} at ${shop(i)}`))).toContain('on {:NUM}')
  })

  it('labels at most one account', () => {
    expect(pattern(each((m, i) => `Card *1234 charged EGP ${i + 1}.00 at ${m} code 5555`))).toContain('code {:NUM}')
  })

  it('calls a value a reference from three messages, and at 90% distinct', () => {
    const three = ['AB12CD9', 'XY98ZT7', 'QW45ER1']
    expect(pattern(three.map((r, i) => `Card *1234 charged EGP ${i + 1}.00 txn ${r} done`))).toContain(
      'txn {reference:ID}',
    )
    const ninetyPercent = ['A1', 'B2', 'C3', 'D4', 'E5', 'F6', 'G7', 'H8', 'J9', 'A1']
    expect(pattern(ninetyPercent.map((r, i) => `Card *1234 charged EGP ${i + 1}.00 txn ${r}BCDE9 done`))).toContain(
      'txn {reference:ID}',
    )
  })

  it('labels at most one reference', () => {
    expect(pattern(each((_, i) => `Card *1234 charged EGP ${i + 1}.00 ref AB${i}CD9 txn XY${i}ZT7 done`))).toContain(
      'ref {reference:ID} txn {:ID} done',
    )
  })

  it('adds no description when a merchant already names the transaction', () => {
    const notes = ['alpha', 'bravo', 'charlie', 'delta', 'echoes']
    expect(pattern(each((m, i) => `Card *1234 charged EGP ${i + 1}.00 at ${m} note ${notes[i]}`))).toContain(
      'note {:TEXT}',
    )
  })

  it('does not make a description out of short connecting words', () => {
    const words = ['on', 'by', 'via', 'per', 'for']
    expect(pattern(words.map((w, i) => `Card *1234 charged EGP ${i + 1}.00 ${w} site`))).toContain('{:TEXT} site')
  })

  it('only uses the slot the direction word was found in as the direction', () => {
    expect(pattern(each((m, i) => `Dear ${m} your card *1234 was debited EGP ${i + 1}.00`))).toContain(
      'Dear {description:TEXT} your',
    )
  })
})
