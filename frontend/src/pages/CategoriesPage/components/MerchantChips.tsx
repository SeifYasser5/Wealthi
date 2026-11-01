import { useState } from 'react'
import { Plus, X } from 'lucide-react'
import type { Category } from '@wealthi/shared'
import { IconButton } from '../../../components/IconButton'
import { SubmitButton, TextField } from '../../../components/TextField'
import { useSetMerchantCategory } from '../../../hooks/useCategories'

/**
 * The merchants mapped to a category, each removable, and a field to map one
 * more. Mapping a merchant another category holds moves it here.
 */
export function MerchantChips({ category }: { category: Category }) {
  const [adding, setAdding] = useState(false)
  const [merchant, setMerchant] = useState('')
  const mapping = useSetMerchantCategory()
  const close = () => {
    setAdding(false)
    setMerchant('')
  }

  return (
    <div className="mt-3 flex flex-wrap items-center gap-2">
      {category.merchants.map((m) => (
        <span
          key={m}
          className="inline-flex items-center gap-1 rounded-full bg-surface-raised py-1 pr-1 pl-3 text-xs font-medium text-subtle"
        >
          {m}
          <button
            type="button"
            aria-label={`Remove ${m} from ${category.name}`}
            disabled={mapping.isPending}
            onClick={() => mapping.mutate({ merchant: m, categoryId: null })}
            className="grid size-5 place-items-center rounded-full transition-colors hover:bg-surface-hover hover:text-foreground focus-visible:outline-2 focus-visible:outline-primary disabled:cursor-wait"
          >
            <X size={12} aria-hidden />
          </button>
        </span>
      ))}

      {adding ? (
        <form
          className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:min-w-96"
          onSubmit={(e) => {
            e.preventDefault()
            // Not trimmed: merchant strings are exact, as the bank prints them.
            mapping.mutate({ merchant, categoryId: category.id }, { onSuccess: close })
          }}
        >
          <TextField
            label={`Merchant to map to ${category.name}`}
            placeholder="Exactly as the bank prints it"
            value={merchant}
            onChange={setMerchant}
            autoFocus
          />
          <SubmitButton disabled={!merchant || mapping.isPending}>Map</SubmitButton>
          <IconButton icon={X} label="Cancel mapping" onClick={close} />
        </form>
      ) : (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="inline-flex items-center gap-1 rounded-full border border-dashed border-line px-3 py-1 text-xs font-medium text-muted transition-colors hover:border-primary-line hover:text-primary focus-visible:outline-2 focus-visible:outline-primary"
        >
          <Plus size={12} aria-hidden />
          Merchant
        </button>
      )}

      {mapping.error && (
        <p role="alert" className="w-full text-xs text-negative">
          {mapping.error.message}
        </p>
      )}
    </div>
  )
}
