import { useState } from 'react'
import { ArrowDown, ArrowUp, Pencil, Trash2, X } from 'lucide-react'
import type { Category } from '@wealthi/shared'
import { IconButton } from '../../../components/IconButton'
import { SubmitButton, TextField } from '../../../components/TextField'
import { useRenameCategory } from '../../../hooks/useCategories'
import { plural } from '../../../utils/utils'
import { MerchantChips } from './MerchantChips'

interface Props {
  category: Category
  first: boolean
  last: boolean
  /** A reorder or delete is in flight: every row's move and delete wait for it. */
  busy: boolean
  onMove: (by: -1 | 1) => void
  onDelete: () => void
}

/** What still uses a category; the backend refuses to delete it until nothing does. */
function usage({ transactionCount, scheduleCount, merchants }: Category): string | null {
  const uses = [
    transactionCount > 0 && plural(transactionCount, 'transaction'),
    scheduleCount > 0 && plural(scheduleCount, 'schedule'),
    merchants.length > 0 && plural(merchants.length, 'merchant'),
  ].filter(Boolean)
  if (uses.length === 0) return null
  return `Used by ${uses.length > 1 ? `${uses.slice(0, -1).join(', ')} and ${uses.at(-1)}` : uses[0]}`
}

export function CategoryItem({ category, first, last, busy, onMove, onDelete }: Props) {
  const [renaming, setRenaming] = useState(false)
  const used = usage(category)
  const { name } = category

  return (
    <li aria-label={name} className="p-5">
      <div className="flex flex-wrap items-center gap-3">
        {renaming ? (
          <RenameForm category={category} onDone={() => setRenaming(false)} />
        ) : (
          <>
            <div className="min-w-0 flex-1">
              <h3 className="font-semibold text-foreground">{name}</h3>
              <p className="mt-0.5 text-xs text-muted">
                {used ? `${used} · move them to another category to delete it` : 'Not used yet'}
              </p>
            </div>
            <div className="flex items-center gap-1">
              <IconButton
                icon={ArrowUp}
                label={`Move ${name} up`}
                disabled={first || busy}
                onClick={() => onMove(-1)}
              />
              <IconButton
                icon={ArrowDown}
                label={`Move ${name} down`}
                disabled={last || busy}
                onClick={() => onMove(1)}
              />
              <IconButton icon={Pencil} label={`Rename ${name}`} onClick={() => setRenaming(true)} />
              <IconButton
                icon={Trash2}
                tone="danger"
                label={`Delete ${name}`}
                title={used ? `${used}: move them to another category first` : undefined}
                disabled={used !== null || busy}
                onClick={onDelete}
              />
            </div>
          </>
        )}
      </div>
      <MerchantChips category={category} />
    </li>
  )
}

function RenameForm({ category, onDone }: { category: Category; onDone: () => void }) {
  const [name, setName] = useState(category.name)
  const rename = useRenameCategory()

  return (
    <form
      className="flex min-w-0 flex-1 flex-wrap items-center gap-2"
      onSubmit={(e) => {
        e.preventDefault()
        const next = name.trim()
        if (next === category.name) onDone()
        else rename.mutate({ id: category.id, name: next }, { onSuccess: onDone })
      }}
    >
      <TextField label={`New name for ${category.name}`} value={name} onChange={setName} maxLength={40} autoFocus />
      <SubmitButton disabled={!name.trim() || rename.isPending}>Save</SubmitButton>
      <IconButton icon={X} label="Cancel rename" onClick={onDone} />
      {rename.error && (
        <p role="alert" className="w-full text-xs text-negative">
          {rename.error.message}
        </p>
      )}
    </form>
  )
}
