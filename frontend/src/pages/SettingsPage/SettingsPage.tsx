import { useState } from 'react'
import { PageTitle } from '../../components/PageHeader'
import { SegmentedControl } from '../../components/SegmentedControl'
import { AccountsSection } from './components/AccountsSection'
import { ImportSection } from './components/ImportSection'
import { LearnSection } from './components/LearnSection'
import { ManualSection } from './components/ManualSection'
import { SendersSection } from './components/SendersSection'
import { SourcesSection } from './components/SourcesSection'
import { TransferRulesSection } from './components/TransferRulesSection'

const SECTIONS = [
  { value: 'senders', label: 'Senders' },
  { value: 'accounts', label: 'Accounts' },
  { value: 'sources', label: 'Sources' },
  { value: 'learn', label: 'Learn' },
  { value: 'import', label: 'Import' },
  { value: 'transfers', label: 'Transfer rules' },
  { value: 'manual', label: 'Manual' },
] as const

type Section = (typeof SECTIONS)[number]['value']

/** What the import reads besides the SMS and the patterns: accounts, sources, transfer rules and senders, the manual transactions, and runs the import. */
export function SettingsPage() {
  const [section, setSection] = useState<Section>('senders')

  return (
    <div className="mx-auto max-w-6xl px-4 pt-6 pb-4 md:flex md:h-[calc(100dvh-4rem-1px)] md:flex-col">
      <header className="mb-6 shrink-0 space-y-4">
        <div>
          <PageTitle>Settings</PageTitle>
          <p className="mt-1 max-w-2xl text-sm text-subtle">
            Where your messages come from and which account they belong to. A change applies to the next import; nothing
            already on the ledger is rewritten until then.
          </p>
        </div>
        <SegmentedControl label="Section" value={section} options={SECTIONS} onChange={setSection} />
      </header>

      {section === 'accounts' && <AccountsSection />}
      {section === 'sources' && <SourcesSection />}
      {section === 'transfers' && <TransferRulesSection />}
      {section === 'senders' && <SendersSection />}
      {section === 'manual' && <ManualSection />}
      {section === 'learn' && <LearnSection />}
      {section === 'import' && <ImportSection />}
    </div>
  )
}
