import { ArrowDownLeft, ArrowUpRight, Tags, TriangleAlert } from 'lucide-react'
import type { PatternRow, PatternType } from '@wealthi/shared'
import { plural } from '../../../utils/utils'

/** What an unnamed slot (`{:CUR}`) stands in for: matched, but its value is not used. */
const TYPE_LABELS: Record<string, string> = {
  MASKED: 'any card no.',
  CUR: 'any currency',
  NUM: 'any number',
  TEXT: 'any text',
  DATE: 'any date',
  TIME: 'any time',
}

/** Chip colour by what the value is: money, who it was with, or where/when. */
const MONEY = new Set(['amount', 'balance', 'currency'])
const PARTY = new Set(['merchant', 'counterparty', 'description', 'reference', 'direction'])

function chipTone(role: string): string {
  if (MONEY.has(role)) return 'bg-positive-soft text-positive'
  if (PARTY.has(role)) return 'bg-primary-soft text-primary'
  return 'bg-surface-hover text-foreground'
}

/** One `{role:TYPE}` slot as a readable chip; the raw slot stays in the tooltip. */
function Slot({ token }: { token: string }) {
  const [role, type] = token.slice(1, -1).split(':')
  const chip = 'mx-0.5 inline-flex items-center rounded-full px-2.5 py-0.5 align-baseline text-xs font-semibold'

  if (!role) {
    return (
      <span
        title={`${token} — must be there, value not used`}
        className={`${chip} border border-dashed border-line font-medium text-muted`}
      >
        {TYPE_LABELS[type]}
      </span>
    )
  }

  const label = role[0].toUpperCase() + role.slice(1)
  return (
    <span title={token} className={`${chip} ${chipTone(role)}`}>
      {/* A masked account is the card's last digits: show it the way the bank does. */}
      {type === 'MASKED' ? `•••• ${label}` : label}
    </span>
  )
}

/** The pattern as a sentence: literal words as text, every slot a chip. */
function PatternText({ pattern }: { pattern: string }) {
  return (
    <p className="mt-3 text-[15px] leading-8 wrap-break-word text-subtle">
      {pattern.split(/(\{[^}]*\})/).map((part, i) => (i % 2 === 1 ? <Slot key={i} token={part} /> : part))}
    </p>
  )
}

const TYPES: Record<PatternType, { icon: typeof ArrowUpRight; tone: string }> = {
  debit: { icon: ArrowUpRight, tone: 'bg-negative-soft text-negative' },
  credit: { icon: ArrowDownLeft, tone: 'bg-positive-soft text-positive' },
  'by-keyword': { icon: Tags, tone: 'bg-primary-soft text-primary' },
}

/** What a learned pattern is: its type, bank, reach, text and anything to check before enabling it. */
export function PatternDetails({ pattern }: { pattern: PatternRow }) {
  const { icon: Icon, tone } = TYPES[pattern.type]

  return (
    <div className="flex min-w-0 flex-1 gap-4">
      <span aria-hidden className={`grid size-10 shrink-0 place-items-center rounded-full ${tone}`}>
        <Icon size={18} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
          <span className="inline-block font-semibold text-foreground first-letter:uppercase">{pattern.type}</span>
          <span className="text-muted">·</span>
          <span className="text-subtle">{pattern.bank}</span>
          <span className="text-muted">·</span>
          <span className="text-subtle">{plural(pattern.messages, 'message')}</span>
          {pattern.missing && (
            <span className="rounded-full bg-warning-soft px-2.5 py-0.5 text-xs font-medium text-warning">
              Not seen in the latest learn
            </span>
          )}
        </div>
        <PatternText pattern={pattern.pattern} />
        <p className="mt-1 text-xs text-muted">{pattern.reason}</p>
        {pattern.review.length > 0 && (
          <ul aria-label="Check before enabling" className="mt-3 space-y-1.5 rounded-2xl bg-warning-soft px-3 py-2.5">
            {pattern.review.map((note) => (
              <li key={note} className="flex items-start gap-2 text-sm text-warning">
                <TriangleAlert size={14} aria-hidden className="mt-0.5 shrink-0" />
                {note}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
