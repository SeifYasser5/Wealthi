import { describe, expect, it } from 'vitest'
import { decode, DecodeError, extractFromAttributedBody } from '../../src/services/ingest/decode'
import type { DbRow } from '../../src/utils/types'
import { streamtypedBody, toMacDate } from '../fixtures/chat-db'

const row = (over: Partial<DbRow>): DbRow => ({
  rowid: 1n,
  guid: 'g-1',
  message_date: toMacDate(new Date('2026-03-04T05:06:07Z')),
  text: null,
  sender: 'Test Bank',
  attributed_body: null,
  ...over,
})

describe('extractFromAttributedBody', () => {
  it('reads a streamtyped blob', () => {
    expect(extractFromAttributedBody(streamtypedBody('Account *1111 credited'))).toBe('Account *1111 credited')
  })

  it('reads a streamtyped length of 128+ bytes (0x81 + uint16)', () => {
    const long = 'Account *1111 credited with EGP 1.00 '.repeat(8).trim()
    expect(long.length).toBeGreaterThan(0x80)
    expect(extractFromAttributedBody(streamtypedBody(long))).toBe(long)
  })

  it('keeps non-ASCII text intact', () => {
    const arabic = 'تم خصم 50.00 جم من حسابك'
    expect(extractFromAttributedBody(streamtypedBody(arabic))).toBe(arabic)
  })

  it('reads a streamtyped length of 64 KiB+ (0x82 + uint32)', () => {
    const huge = 'x'.repeat(0x10005)
    expect(extractFromAttributedBody(streamtypedBody(huge))).toBe(huge)
  })

  it('returns null for a blob with no NSString', () => {
    expect(extractFromAttributedBody(Buffer.from('nothing to see here'))).toBeNull()
  })

  it('returns null for a streamtyped blob it cannot trust', () => {
    const good = streamtypedBody('hello')
    const tag = good.indexOf(0x2b, good.indexOf('NSString'))
    // no 0x2B string tag near the class name
    const noTag = Buffer.concat([good.subarray(0, tag), Buffer.alloc(20, 0x84)])
    expect(extractFromAttributedBody(noTag)).toBeNull()
    // zero length
    const empty = Buffer.from(good)
    empty[tag + 1] = 0
    expect(extractFromAttributedBody(empty)).toBeNull()
    // length running past the end of the blob
    expect(extractFromAttributedBody(good.subarray(0, tag + 4))).toBeNull()
    // only whitespace
    expect(extractFromAttributedBody(streamtypedBody('   '))).toBeNull()
  })

  // NSKeyedArchiver blobs are binary plists; these reproduce only the bytes the
  // decoder looks at: the "NSString\x01" marker, metadata, then the UTF-8 text
  // ending at the first byte that isn't valid UTF-8.
  const keyed = (...parts: (string | number[])[]) =>
    Buffer.concat([
      Buffer.from('bplist00\xd4\x01\x02', 'latin1'),
      ...parts.map((p) => (typeof p === 'string' ? Buffer.from(p, 'utf8') : Buffer.from(p))),
    ])

  it('reads a keyed archive, skipping metadata up to the text', () => {
    const body = keyed('NSString\x01', [0x95, 0x84, 0x01, 0x00], 'Account *1111 credited', [0x86, 0x84, 0x02])
    expect(extractFromAttributedBody(body)).toBe('Account *1111 credited')
  })

  it('reads a keyed archive whose text follows the marker directly', () => {
    expect(extractFromAttributedBody(keyed('NSString\x01', 'تم خصم 50 جم', [0x86]))).toBe('تم خصم 50 جم')
  })

  it('strips control characters and reads to the end when nothing terminates the text', () => {
    expect(extractFromAttributedBody(keyed('NSString\x01', 'line one\x02 two'))).toBe('line one two')
  })

  it('returns null for a keyed archive with no text', () => {
    expect(extractFromAttributedBody(keyed('NSString\x01', [0x86]))).toBeNull()
  })
})

describe('decode', () => {
  it('prefers the text column', () => {
    const d = decode(row({ text: 'plain', attributed_body: streamtypedBody('blob') }))
    expect(d.text).toBe('plain')
  })

  it('falls back to attributedBody and converts the Mac date', () => {
    const d = decode(row({ attributed_body: streamtypedBody('from blob') }))
    expect(d.text).toBe('from blob')
    expect(d.messageDate.toISOString()).toBe('2026-03-04T05:06:07.000Z')
  })

  it('throws DecodeError when there is no text anywhere', () => {
    expect(() => decode(row({}))).toThrow(DecodeError)
  })
})

// Boundaries found by mutation testing (npm run test:mutation).
describe('extractFromAttributedBody boundaries', () => {
  /** A streamtyped blob with `gap` bytes between "NSString" and the 0x2B string tag. */
  const withGap = (text: string, gap: number) => {
    const good = streamtypedBody(text)
    const at = good.indexOf('NSString') + 'NSString'.length
    const tag = good.indexOf(0x2b, at)
    return Buffer.concat([good.subarray(0, at), Buffer.alloc(gap, 0x84), good.subarray(tag)])
  }
  const keyed = (...parts: (string | number[])[]) =>
    Buffer.concat([
      Buffer.from('bplist00', 'latin1'),
      ...parts.map((p) => (typeof p === 'string' ? Buffer.from(p, 'utf8') : Buffer.from(p))),
    ])

  it('accepts the string tag up to 16 bytes after the class name, not 17', () => {
    expect(extractFromAttributedBody(withGap('hello', 16))).toBe('hello')
    expect(extractFromAttributedBody(withGap('hello', 17))).toBeNull()
  })

  it('reads text that ends exactly at the end of the blob', () => {
    const good = streamtypedBody('hello')
    expect(extractFromAttributedBody(good.subarray(0, good.length - 6))).toBe('hello')
  })

  it('returns null for a streamtyped header with no NSString', () => {
    expect(extractFromAttributedBody(Buffer.from('\x04\x0bstreamtyped+\x05hello', 'latin1'))).toBeNull()
  })

  it('treats "streamtyped" as the format only within the first 8 bytes', () => {
    expect(extractFromAttributedBody(keyed('streamtyped', 'NSString\x01', 'hello', [0x86]))).toBe('hello')
    expect(extractFromAttributedBody(keyed('NSString\x01', 'mentions streamtyped here', [0x86]))).toBe(
      'mentions streamtyped here',
    )
  })

  // Trailing archive bytes contain a 0x00 + printable run: if the first text byte
  // were mistaken for metadata, the decoder would skip ahead to "ZZ".
  it.each([
    ['a space', ' abc', 'abc'],
    ['a tilde', '~abc', '~abc'],
    ['a two-byte UTF-8 letter', '©abc', '©abc'],
    ['a four-byte UTF-8 emoji', '😀 hi', '😀 hi'],
  ])('reads text starting with %s directly after the marker', (_, text, expected) => {
    expect(extractFromAttributedBody(keyed('NSString\x01', text, [0x86, 0x00, 0x5a, 0x5a]))).toBe(expected)
  })

  it('treats a first byte of 0x7F as metadata', () => {
    expect(extractFromAttributedBody(keyed('NSString\x01', [0x7f, 0x00], 'Hello', [0x86]))).toBe('Hello')
  })

  it('starts the text at a space right after the metadata', () => {
    expect(extractFromAttributedBody(keyed('NSString\x01', [0x95, 0x84, 0x00], ' Hello', [0x86]))).toBe('Hello')
  })

  it('gives up on metadata longer than 32 bytes', () => {
    const metadata = [0x95, ...Array(40).fill(0x84), 0x00]
    expect(extractFromAttributedBody(keyed('NSString\x01', metadata, 'Hello', [0x86]))).toBeNull()
  })

  it('trims surrounding whitespace', () => {
    expect(extractFromAttributedBody(keyed('NSString\x01', 'Hello  ', [0x86]))).toBe('Hello')
  })
})

describe('DecodeError', () => {
  it('names the message it could not decode', () => {
    const error = (() => {
      try {
        decode(row({ guid: 'g-9' }))
      } catch (e) {
        return e as DecodeError
      }
    })()!
    expect(error.name).toBe('DecodeError')
    expect(error.message).toBe('Failed to decode message text (guid=g-9, sender=Test Bank)')
    expect(error.raw.guid).toBe('g-9')
  })
})
