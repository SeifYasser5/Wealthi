import { Check } from 'lucide-react'
import type { PatternRow } from '@wealthi/shared'
import { PatternDetails } from './PatternDetails'

/**
 * A pattern as a clickable card: the whole card toggles it, a round check
 * shows whether it is on. The review uses it to select, the tabs to enable.
 */
export function PatternCard({
  pattern,
  on,
  onToggle,
  disabled,
}: {
  pattern: PatternRow
  on: boolean
  onToggle: () => void
  /** A save is in flight: the card can't be toggled again yet. */
  disabled?: boolean
}) {
  return (
    <label
      className={`flex cursor-pointer items-start gap-4 rounded-2xl p-5 ring-1 transition-colors has-focus-visible:outline-2 has-focus-visible:outline-primary has-disabled:cursor-wait ${
        on ? 'bg-primary-soft ring-primary-line' : 'bg-surface-raised ring-transparent hover:bg-surface-hover'
      }`}
    >
      <PatternDetails pattern={pattern} />
      <input
        type="checkbox"
        aria-label={`Enable ${pattern.id}`}
        className="sr-only"
        checked={on}
        disabled={disabled}
        onChange={onToggle}
      />
      <span
        aria-hidden
        className={`mt-2 grid size-6 shrink-0 place-items-center rounded-full border-2 transition-colors ${
          on ? 'border-primary bg-primary' : 'border-muted'
        }`}
      >
        <Check
          size={14}
          strokeWidth={3}
          className={`text-on-primary transition-transform ${on ? 'scale-100' : 'scale-0'}`}
        />
      </span>
    </label>
  )
}
