/**
 * Cleans a decoded SMS body down to the text a human would read.
 *
 * `decode()` recovers the message from `text` or from an `attributedBody`
 * archive, and what comes out still carries characters that are invisible but
 * very much there: bidi marks around Arabic runs, zero-width joiners, the
 * object-replacement character iMessage leaves where an attachment was, NBSPs,
 * and (on the streamtyped path, which doesn't strip them) stray control bytes.
 * They survive JSON, so without this they show up in the UI as blank boxes or
 * silently flip the direction of a line of Arabic.
 *
 * This runs on the copy that is *stored* (`transactions.raw_text`), never on
 * the text handed to the pattern matcher: patterns were learned against the
 * bytes as they arrive, so rewriting the parser's input could stop a learned
 * pattern matching.
 */

// C0/C1 controls, minus tab, newline and carriage return, which are normalized
// as whitespace below.
const CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g

/**
 * Invisible formatting characters: zero-width space and joiners; the LTR/RTL
 * marks, embeddings, overrides and isolates that wrap an Arabic run; word
 * joiner and friends; the interlinear-annotation and object-replacement
 * characters (an attachment placeholder); U+FFFD, left where decoding gave up;
 * and the BOM.
 */
const INVISIBLE = /[\u200B-\u200F\u202A-\u202E\u2060-\u2064\u2066-\u2069\uFFF9-\uFFFC\uFFFD\uFEFF]/g

/** Whitespace that is not U+0020: tab, NBSP, the en/em quad family, ideographic space. */
const ODD_SPACE = /[\t\u00A0\u1680\u2000-\u200A\u202F\u205F\u3000]/g

/**
 * Strips the invisible characters, folds every space variant to U+0020 and
 * normalizes line breaks, collapsing runs of spaces and trimming each line, so
 * the stored text is the message and nothing else. Returns "" for a body that
 * was nothing but noise.
 */
export function sanitizeMessageText(text: string): string {
  return text
    .replace(CONTROL, '')
    .replace(INVISIBLE, '')
    .replace(ODD_SPACE, ' ')
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.replace(/ +/g, ' ').trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}
