import { useState } from 'react'
import { MessageSquare, Trash2 } from 'lucide-react'
import { ConfirmDelete } from '../../../components/ConfirmDelete'
import { Field, Input } from '../../../components/FormFields'
import { IconButton } from '../../../components/IconButton'
import { QueryState } from '../../../components/QueryState'
import { SubmitButton } from '../../../components/TextField'
import { useAddBankSender, useBankSenders, useDeleteBankSender } from '../../../hooks/useSettings'

function SenderForm() {
  const [sender, setSender] = useState('')
  const add = useAddBankSender()

  return (
    <form
      aria-label="Add a sender"
      className="shrink-0 space-y-4 rounded-3xl bg-surface p-6"
      onSubmit={(e) => {
        e.preventDefault()
        add.mutate(sender.trim(), { onSuccess: () => setSender('') })
      }}
    >
      <div className="grid gap-4 sm:grid-cols-[1fr_auto] sm:items-end">
        <Field label="Sender">
          <Input
            label="Sender"
            type="text"
            value={sender}
            onChange={setSender}
            placeholder="Name or phone number"
            maxLength={100}
          />
        </Field>
        <SubmitButton disabled={sender.trim() === '' || add.isPending}>Add sender</SubmitButton>
      </div>
      {add.error && (
        <p role="alert" className="rounded-2xl bg-negative-soft p-4 text-sm text-negative">
          {add.error.message}
        </p>
      )}
    </form>
  )
}

function SenderItem({ sender }: { sender: string }) {
  const [confirming, setConfirming] = useState(false)
  const remove = useDeleteBankSender()

  return (
    <li aria-label={sender} className="p-5">
      <div className="flex flex-wrap items-center gap-4">
        <span aria-hidden className="grid size-9 shrink-0 place-items-center rounded-full bg-surface-hover text-subtle">
          <MessageSquare size={16} />
        </span>
        <h3 className="min-w-0 flex-1 font-semibold text-foreground">{sender}</h3>
        <IconButton
          icon={Trash2}
          tone="danger"
          label={`Remove ${sender}`}
          disabled={confirming}
          onClick={() => setConfirming(true)}
        />
      </div>
      {confirming && (
        <ConfirmDelete
          pending={remove.isPending}
          error={remove.error}
          onKeep={() => setConfirming(false)}
          onConfirm={() => remove.mutate(sender)}
        >
          Remove {sender}? Its messages are no longer imported or learned from.
        </ConfirmDelete>
      )}
    </li>
  )
}

/** The Messages senders a bank texts from; only these are read. */
export function SendersSection() {
  const senders = useBankSenders()

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-6">
      <p className="max-w-2xl shrink-0 text-sm text-subtle">
        The name or phone number your bank sends its SMS from, exactly as Messages shows it. Only messages from these
        senders are imported or learned from.
      </p>
      <SenderForm />
      <QueryState
        query={senders}
        isEmpty={(data) => data.bankSenders.length === 0}
        errorMessage="Could not load senders."
        emptyMessage="No senders yet. Nothing is imported or learned until you add the one your bank texts from."
      >
        {(data) => (
          <ul aria-label="Your senders" className="min-h-0 divide-y divide-line overflow-y-auto rounded-3xl bg-surface">
            {data.bankSenders.map((sender) => (
              <SenderItem key={sender} sender={sender} />
            ))}
          </ul>
        )}
      </QueryState>
    </div>
  )
}
