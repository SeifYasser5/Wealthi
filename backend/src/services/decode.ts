import type { DecodedMessage, DbRow } from '../utils/types'
import { macDateToJs } from '../utils/helpers'

/**
 * Extracts the SMS text an iMessage stores in its `attributedBody` blob, in
 * either of the two archive formats macOS has used.
 *
 * Pattern parsing matches whole messages, so stray archive bytes would break
 * it. Two details earn their code here:
 * - streamtyped blobs are detected by their header, not by searching for
 *   "NSString\x01" — they contain that marker too, and reading one as a binary
 *   plist leaks the length prefix into the text ("��+V…") with archive bytes
 *   trailing it.
 * - a streamtyped length of 128+ bytes is 0x81 + int16 or 0x82 + int32, not one
 *   byte.
 */

const STREAMTYPED_HEADER = Buffer.from('streamtyped', 'latin1')
// NSKeyedArchiver (binary plist) format — modern iMessages
const NSSTRING_MARKER = Buffer.from('NSString\x01', 'binary')
const NSSTRING = Buffer.from('NSString', 'latin1')
// 0x2B = '+': string type tag in the streamtyped encoding
const STREAMTYPED_STRING_TAG = 0x2b
const CONTROL_CHARS = /[\x01-\x1F\x7F-\x9F]/g

function decodeStreamtyped(body: Buffer): string | null {
  // Structure after the NSString class entry:
  //   [class-version metadata] 0x2B [length] [string bytes]
  // length: one byte below 0x81, else 0x81 + uint16 LE or 0x82 + uint32 LE.
  const at = body.indexOf(NSSTRING)
  if (at === -1) return null
  const searchStart = at + NSSTRING.length
  const tag = body.indexOf(STREAMTYPED_STRING_TAG, searchStart)
  if (tag === -1 || tag > searchStart + 16) return null

  let start = tag + 2
  let len = body[tag + 1]
  if (len === 0x81) {
    len = body.readUInt16LE(tag + 2)
    start = tag + 4
  } else if (len === 0x82) {
    len = body.readUInt32LE(tag + 2)
    start = tag + 6
  }
  if (len === 0 || start + len > body.length) return null
  return (
    body
      .subarray(start, start + len)
      .toString('utf8')
      .trim() || null
  )
}

function decodeKeyedArchive(body: Buffer): string | null {
  // Finds "NSString\x01", skips plist metadata up to a \x00 + printable boundary,
  // then decodes UTF-8 up to the first U+FFFD (a lone non-UTF-8 terminator byte).
  const markerIdx = body.indexOf(NSSTRING_MARKER)
  if (markerIdx === -1) return null
  const metaStart = markerIdx + NSSTRING_MARKER.length
  let textStart = metaStart
  const firstByte = body[metaStart] ?? 0
  const isMetadata = !(firstByte >= 0x20 && firstByte <= 0x7e) && !(firstByte >= 0xc2 && firstByte <= 0xf7)
  if (isMetadata) {
    for (let i = metaStart; i < Math.min(metaStart + 32, body.length - 1); i++) {
      if (body[i] === 0x00 && body[i + 1] >= 0x20) {
        textStart = i + 1
        break
      }
    }
  }
  const raw = body.subarray(textStart).toString('utf8')
  const end = raw.indexOf('�')
  return (end === -1 ? raw : raw.slice(0, end)).replace(CONTROL_CHARS, '').trim() || null
}

/** Extracts the SMS text from an iMessage attributedBody blob (streamtyped or NSKeyedArchiver). */
export function extractFromAttributedBody(body: Buffer): string | null {
  const header = body.indexOf(STREAMTYPED_HEADER)
  return header !== -1 && header < 8 ? decodeStreamtyped(body) : decodeKeyedArchive(body)
}

/** Thrown when a message yields no text — neither a `text` column nor a decodable attributedBody. */
export class DecodeError extends Error {
  constructor(public readonly raw: DbRow) {
    super(`Failed to decode message text (guid=${raw.guid}, sender=${raw.sender})`)
    this.name = 'DecodeError'
  }
}

export function decode(raw: DbRow): DecodedMessage {
  const text = raw.text ?? (raw.attributed_body !== null ? extractFromAttributedBody(raw.attributed_body) : null)
  if (!text) throw new DecodeError(raw)
  return { messageDate: macDateToJs(raw.message_date), text, sender: raw.sender, guid: raw.guid, rowid: raw.rowid }
}
