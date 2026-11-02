import { useState } from 'react'
import { KeyRound, Trash2 } from 'lucide-react'
import type { AccountSource } from '@wealthi/shared'
import { ConfirmDelete } from '../../../components/ConfirmDelete'
import { Field, Input } from '../../../components/FormFields'
import { IconButton } from '../../../components/IconButton'
import { QueryState } from '../../../components/QueryState'
import { Select } from '../../../components/Select'
import { SubmitButton } from '../../../components/TextField'
import { useAccounts } from '../../../hooks/useAccounts'
import { useAccountSources, useDeleteAccountSource, useSetAccountSource } from '../../../hooks/useSettings'

/** Maps a source key to an account. A key already mapped moves to the chosen account. */
function SourceForm() {
  const { accounts } = useAccounts()
  const [source, setSource] = useState('')
  const [account, setAccount] = useState('')
  const save = useSetAccountSource()

  // Until the accounts load there is nothing to pick; then the first is the default.
  const chosen = account || (accounts[0]?.id ?? '')

  return (
    <form
      aria-label="Map a source"
      className="shrink-0 space-y-4 rounded-3xl bg-surface p-6"
      onSubmit={(e) => {
        e.preventDefault()
        save.mutate({ source: source.trim(), account: chosen }, { onSuccess: () => setSource('') })
      }}
    >
      <div className="grid gap-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
        <Field label="Source key">
          <Input
            label="Source key"
            type="text"
            value={source}
            onChange={setSource}
            placeholder="e.g. my-bank:1234"
            maxLength={100}
          />
        </Field>
        <Field label="Account">
          <Select label="Account" value={chosen} onChange={setAccount}>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.label}
              </option>
            ))}
          </Select>
        </Field>
        <SubmitButton disabled={source.trim() === '' || chosen === '' || save.isPending}>Map source</SubmitButton>
      </div>
      {save.error && (
        <p role="alert" className="rounded-2xl bg-negative-soft p-4 text-sm text-negative">
          {save.error.message}
        </p>
      )}
    </form>
  )
}

/** One mapping: the account it lands on can be changed in place. Removing asks first. */
function SourceItem({ mapping }: { mapping: AccountSource }) {
  const { accounts } = useAccounts()
  const [confirming, setConfirming] = useState(false)
  const move = useSetAccountSource()
  const remove = useDeleteAccountSource()
  const { source, account } = mapping

  return (
    <li aria-label={source} className="p-5">
      <div className="flex flex-wrap items-center gap-4">
        <span aria-hidden className="grid size-9 shrink-0 place-items-center rounded-full bg-surface-hover text-subtle">
          <KeyRound size={16} />
        </span>
        <h3 className="min-w-0 flex-1 font-mono text-sm font-semibold text-foreground">{source}</h3>
        <Select
          label={`Account for ${source}`}
          value={account}
          onChange={(next) => move.mutate({ source, account: next })}
        >
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.label}
            </option>
          ))}
        </Select>
        <IconButton
          icon={Trash2}
          tone="danger"
          label={`Remove ${source}`}
          disabled={confirming}
          onClick={() => setConfirming(true)}
        />
      </div>
      {move.error && (
        <p role="alert" className="mt-3 text-xs text-negative">
          {move.error.message}
        </p>
      )}
      {confirming && (
        <ConfirmDelete
          pending={remove.isPending}
          error={remove.error}
          onKeep={() => setConfirming(false)}
          onConfirm={() => remove.mutate(source)}
        >
          Remove {source}? Messages on it become parse errors at the next import until it is mapped again.
        </ConfirmDelete>
      )}
    </li>
  )
}

/** The source keys patterns yield, and the account each lands on. */
export function SourcesSection() {
  const sources = useAccountSources()

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-6">
      <p className="max-w-2xl shrink-0 text-sm text-subtle">
        A matched message yields a source key, <span className="font-mono">&lt;bank&gt;:&lt;last 4 digits&gt;</span>;
        patterns never name an account. This maps each key to the account its messages belong to.
      </p>
      <SourceForm />
      <QueryState
        query={sources}
        isEmpty={(data) => data.accountSources.length === 0}
        errorMessage="Could not load sources."
        emptyMessage="No sources yet. Until a key is mapped, its messages are parse errors."
      >
        {(data) => (
          <ul aria-label="Your sources" className="min-h-0 divide-y divide-line overflow-y-auto rounded-3xl bg-surface">
            {data.accountSources.map((mapping) => (
              <SourceItem key={mapping.source} mapping={mapping} />
            ))}
          </ul>
        )}
      </QueryState>
    </div>
  )
}
