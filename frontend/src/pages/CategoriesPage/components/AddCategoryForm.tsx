import { useState } from 'react'
import { SubmitButton, TextField } from '../../../components/TextField'
import { useCreateCategory } from '../../../hooks/useCategories'

/** Names a new category; it is added after the others. Compact, for the page header's corner. */
export function AddCategoryForm() {
  const [name, setName] = useState('')
  const create = useCreateCategory()

  return (
    <section aria-label="Add a category" className="w-full sm:w-72">
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          create.mutate(name.trim(), { onSuccess: () => setName('') })
        }}
      >
        <TextField label="New category" placeholder="New category…" value={name} onChange={setName} maxLength={40} />
        <SubmitButton disabled={!name.trim() || create.isPending}>Add</SubmitButton>
      </form>
      {create.error && (
        <p role="alert" className="mt-2 text-xs text-negative">
          {create.error.message}
        </p>
      )}
    </section>
  )
}
