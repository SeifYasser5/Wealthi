interface Option<T extends string> {
  value: T
  label: string
}

/**
 * An iOS-style segmented control: one choice out of a few, all visible. Real
 * radio inputs underneath, so arrow keys move the choice and tests can query
 * `radio` by name inside the `radiogroup` named by `label`.
 */
export function SegmentedControl<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: T
  options: readonly Option<T>[]
  onChange: (value: T) => void
}) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex rounded-full bg-surface-raised p-0.5">
      {options.map((o) => (
        <label
          key={o.value}
          className={`rounded-full px-3.5 py-1.5 text-sm font-medium whitespace-nowrap transition-colors has-focus-visible:outline-2 has-focus-visible:outline-primary ${
            o.value === value ? 'bg-surface-hover text-foreground shadow-sm' : 'text-subtle hover:text-foreground'
          }`}
        >
          <input
            type="radio"
            name={label}
            value={o.value}
            checked={o.value === value}
            onChange={() => onChange(o.value)}
            className="sr-only"
          />
          {o.label}
        </label>
      ))}
    </div>
  )
}
