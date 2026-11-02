import { SubmitButton } from './TextField'

/** The end of a form: why the last save failed, then Cancel and the submit button. */
export function FormFooter({
  error,
  disabled,
  onCancel,
  children,
}: {
  error: Error | null
  disabled: boolean
  onCancel: () => void
  /** The submit button's label. */
  children: string
}) {
  return (
    <>
      {error && (
        <p role="alert" className="rounded-2xl bg-negative-soft p-4 text-sm text-negative">
          {error.message}
        </p>
      )}
      <div className="flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="h-9 rounded-full px-4 text-sm font-medium text-subtle transition-colors hover:bg-surface-hover hover:text-foreground focus-visible:outline-2 focus-visible:outline-primary"
        >
          Cancel
        </button>
        <SubmitButton disabled={disabled}>{children}</SubmitButton>
      </div>
    </>
  )
}
