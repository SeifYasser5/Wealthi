import { screen, within } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import type { LearnResponse } from '@wealthi/shared'
import { describe, expect, it } from 'vitest'
import { LEARN_REPORT, LEARNED } from '../fixtures'
import { renderApp } from '../render'
import { api, server } from '../server'

const learnButton = () => screen.getByRole('button', { name: /learn patterns|learning/i })
const report = () => screen.findByRole('region', { name: 'Learn report' })
const review = () => screen.findByRole('region', { name: 'Review new patterns' })
const stored = () => screen.findByRole('region', { name: 'Stored patterns' })
const tab = (name: RegExp) => screen.getByRole('tab', { name })
const panelItems = () => within(screen.getByRole('tabpanel')).queryAllByRole('listitem')
const learns = () => api.requests.filter((u) => u.pathname === '/api/patterns/learn').length

/** Holds the next response to `method path` open until the returned function is called. */
function hold(method: 'post' | 'patch', path: string) {
  let release!: () => void
  const released = new Promise<void>((r) => (release = r))
  server.use(
    http[method](
      path,
      async () => {
        await released
        // Fall through to the default handler, which does the real work.
        return undefined
      },
      { once: true },
    ),
  )
  return () => release()
}

function learnRespondsWith(body: Partial<LearnResponse>) {
  server.use(http.post('*/api/patterns/learn', () => HttpResponse.json({ ...LEARN_REPORT, ...body })))
}

describe('Learn page', () => {
  it('is in the nav bar and opens on the stored patterns, enabled first', async () => {
    const { user } = renderApp('/transactions')
    await user.click(within(screen.getByRole('navigation')).getByRole('link', { name: 'Learn' }))
    expect(await screen.findByRole('heading', { name: 'Learn', level: 1 })).toBeInTheDocument()
    expect(learnButton()).toHaveTextContent('Learn patterns')

    await stored()
    expect(tab(/enabled/i)).toHaveTextContent('Enabled (1)')
    expect(tab(/enabled/i)).toHaveAttribute('aria-selected', 'true')
    expect(tab(/disabled/i)).toHaveTextContent('Disabled (1)')
    expect(panelItems()).toHaveLength(1)
    expect(panelItems()[0]).toHaveTextContent('test-bank')
    expect(panelItems()[0]).toHaveTextContent('12 messages')
    expect(screen.queryByRole('region', { name: 'Review new patterns' })).not.toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Learn report' })).not.toBeInTheDocument()
    expect(learns()).toBe(0)
  })

  it('reads a pattern as a sentence, each slot a named chip coloured by what it holds', async () => {
    renderApp('/learn')
    await stored()
    const merchant = screen.getByText('Merchant')
    expect(merchant).toHaveAttribute('title', '{merchant:TEXT}')
    expect(merchant).toHaveClass('text-primary')
    expect(screen.getByText('Amount')).toHaveClass('text-positive')
    expect(screen.getByText('•••• Account')).toHaveClass('text-foreground')
    expect(merchant.parentElement).toHaveTextContent('Card •••• Account charged Currency Amount at Merchant')
  })

  it('shows a slot whose value is not used as a dashed placeholder', async () => {
    api.patterns[0] = { ...api.patterns[0], pattern: 'Spent {amount:NUM} . Limit {:CUR} {:NUM}' }
    renderApp('/learn')
    await stored()
    const ignored = screen.getByText('any number')
    expect(ignored).toHaveClass('border-dashed')
    expect(ignored).toHaveAttribute('title', '{:NUM} — must be there, value not used')
    expect(ignored.parentElement).toHaveTextContent('Spent Amount . Limit any currency any number')
  })

  it('shows the disabled patterns in their own tab, flagging one the latest learn did not see', async () => {
    const { user } = renderApp('/learn')
    await stored()
    await user.click(tab(/disabled/i))
    expect(tab(/disabled/i)).toHaveAttribute('aria-selected', 'true')
    const [item] = panelItems()
    expect(item).toHaveTextContent('credit')
    expect(item).toHaveTextContent('Not seen in the latest learn')
    expect(within(item).getByRole('checkbox', { name: 'Enable test-bank:refund' })).not.toBeChecked()
  })

  it('learns, then offers only the new patterns for review', async () => {
    const release = hold('post', '*/api/patterns/learn')
    const { user } = renderApp('/learn')
    await stored()
    await user.click(learnButton())

    expect(learnButton()).toBeDisabled()
    expect(learnButton()).toHaveTextContent('Learning…')
    expect(screen.getByText(/reading your bank messages/)).toHaveAttribute('role', 'status')

    release()
    const card = await report()
    expect(within(card).getByRole('heading', { name: 'Found 2 new patterns' })).toBeInTheDocument()
    expect(card).toHaveTextContent('Learned from 120 bank messages. Review them below.')
    expect(card).toHaveTextContent('/data/chat.db · finished Feb 01, 2026 · took 1.3 s')

    const section = await review()
    const boxes = within(section).getAllByRole('checkbox', { name: /^Enable / })
    expect(boxes.map((b) => b.getAttribute('aria-label'))).toEqual(LEARNED.map((p) => `Enable ${p.id}`))
    expect(boxes.map((b) => (b as HTMLInputElement).checked)).toEqual([false, false])
    expect(within(section).getByRole('list', { name: 'Check before enabling' })).toHaveTextContent(
      'seen in only 2 messages',
    )
    expect(section).toHaveTextContent('0 of 2 selected · 2 patterns will be saved disabled')
    expect(learnButton()).toBeEnabled()
  })

  it('enables what you select, saves the rest disabled, and moves both into the tabs', async () => {
    const { user } = renderApp('/learn')
    await stored()
    await user.click(learnButton())
    const section = await review()

    await user.click(within(section).getByRole('checkbox', { name: 'Enable test-bank:transfer' }))
    expect(section).toHaveTextContent('1 of 2 selected · 1 pattern will be saved disabled')
    await user.click(within(section).getByRole('button', { name: 'Enable 1 pattern' }))

    await screen.findByText('Enabled (2)')
    expect(api.patternUpdates).toEqual([{ enable: ['test-bank:transfer'], disable: ['test-bank:deposit'] }])
    expect(screen.queryByRole('region', { name: 'Review new patterns' })).not.toBeInTheDocument()
    expect(tab(/disabled/i)).toHaveTextContent('Disabled (2)')
    expect(within(screen.getByRole('tabpanel')).getByText(/Transfer of/)).toBeInTheDocument()
  })

  it('selects and clears every pattern at once', async () => {
    const { user } = renderApp('/learn')
    await stored()
    await user.click(learnButton())
    const section = await review()
    const bulk = (name: string) => within(section).getByRole('button', { name })

    await user.click(bulk('Select all'))
    expect(section).toHaveTextContent('All selected')
    expect(bulk('Enable 2 patterns')).toBeInTheDocument()
    await user.click(within(section).getByRole('checkbox', { name: 'Enable test-bank:deposit' }))
    await user.click(bulk('Select all'))
    await user.click(bulk('Clear'))
    expect(section).toHaveTextContent('0 of 2 selected · 2 patterns will be saved disabled')
    expect(bulk('Disable all')).toBeInTheDocument()
  })

  it('finds nothing new on a second run once the first was reviewed', async () => {
    const { user } = renderApp('/learn')
    await stored()
    await user.click(learnButton())
    await user.click(within(await review()).getByRole('button', { name: 'Disable all' }))
    await screen.findByText('Disabled (3)')

    await user.click(learnButton())
    await screen.findByRole('heading', { name: 'Nothing new found' })
    expect(await report()).toHaveTextContent('Every pattern in 120 bank messages is already stored.')
    expect(screen.queryByRole('region', { name: 'Review new patterns' })).not.toBeInTheDocument()
    expect(learns()).toBe(2)
  })

  it('offers patterns left pending by an earlier run without learning again, and says so', async () => {
    api.patterns.push(LEARNED[0])
    const { user } = renderApp('/learn')
    const section = await review()
    expect(within(section).getAllByRole('listitem')).toHaveLength(1)

    api.learnable = []
    await user.click(learnButton())
    expect(await report()).toHaveTextContent(
      'Every pattern in 120 bank messages is already stored. 1 pattern from an earlier run is still waiting for review.',
    )
  })

  it('counts several leftover patterns and undecodable messages in the report', async () => {
    api.patterns.push(...LEARNED)
    learnRespondsWith({ added: 0, undecodable: 3 })
    const { user } = renderApp('/learn')
    await review()
    await user.click(learnButton())
    expect(await report()).toHaveTextContent(
      '2 patterns from an earlier run are still waiting for review. 3 messages could not be decoded and were left out.',
    )
  })

  it('notes undecodable messages when it found something too', async () => {
    learnRespondsWith({ added: 1, undecodable: 1 })
    const { user } = renderApp('/learn')
    await user.click(learnButton())
    expect(await report()).toHaveTextContent('Review them below. 1 message could not be decoded and was left out.')
  })

  it('says where it looked when there is no chat.db', async () => {
    learnRespondsWith({ status: 'skipped', source: '/missing/chat.db', messages: 0 })
    const { user } = renderApp('/learn')
    await user.click(learnButton())
    const card = await report()
    expect(within(card).getByRole('heading', { name: 'Learn skipped' })).toBeInTheDocument()
    expect(card).toHaveTextContent('No chat.db found at /missing/chat.db.')
    expect(card.querySelector('svg')).toHaveClass('text-warning')
  })

  it('shows why a learn failed, and lets you try again', async () => {
    server.use(
      http.post('*/api/patterns/learn', () => HttpResponse.json({ error: 'learn failed: db down' }, { status: 500 }), {
        once: true,
      }),
    )
    const { user } = renderApp('/learn')
    await user.click(learnButton())
    expect(await screen.findByRole('alert')).toHaveTextContent('learn failed: db down')
    expect(learnButton()).toBeEnabled()

    await user.click(learnButton())
    expect(await report()).toHaveTextContent('Found 2 new patterns')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('still shows a running learn after leaving the page and coming back', async () => {
    const release = hold('post', '*/api/patterns/learn')
    const { user } = renderApp('/learn')
    await user.click(learnButton())

    const nav = screen.getByRole('navigation')
    await user.click(within(nav).getByRole('link', { name: 'Balances' }))
    await screen.findByRole('heading', { name: 'Balances', level: 1 })
    await user.click(within(nav).getByRole('link', { name: 'Learn' }))

    expect(learnButton()).toBeDisabled()
    release()
    expect(await report()).toHaveTextContent('Found 2 new patterns')
    expect(learns()).toBe(1)
  })

  it('shows the review as saving while it is sent', async () => {
    const { user } = renderApp('/learn')
    await user.click(learnButton())
    const section = await review()

    const release = hold('patch', '*/api/patterns')
    await user.click(within(section).getByRole('button', { name: 'Disable all' }))
    expect(within(section).getByRole('button', { name: 'Saving…' })).toBeDisabled()
    release()
    await screen.findByText('Disabled (3)')
    expect(screen.queryByRole('region', { name: 'Review new patterns' })).not.toBeInTheDocument()
  })

  it('keeps the review open with the reason when saving it fails', async () => {
    server.use(
      http.patch('*/api/patterns', () => HttpResponse.json({ error: 'unknown pattern ids: x' }, { status: 404 })),
    )
    const { user } = renderApp('/learn')
    await user.click(learnButton())
    const section = await review()
    await user.click(within(section).getByRole('button', { name: 'Disable all' }))
    expect(await within(section).findByRole('alert')).toHaveTextContent('unknown pattern ids: x')
    expect(within(section).getAllByRole('checkbox', { name: /^Enable / })).toHaveLength(2)
  })

  it('moves a pattern between the tabs when you click it', async () => {
    const { user } = renderApp('/learn')
    await stored()
    const toggle = screen.getByRole('checkbox', { name: 'Enable test-bank:charge' })
    expect(toggle).toBeChecked()
    await user.click(toggle)

    await screen.findByText('Enabled (0)')
    expect(within(screen.getByRole('tabpanel')).getByText(/No enabled patterns/)).toBeInTheDocument()
    expect(api.patternUpdates).toEqual([{ disable: ['test-bank:charge'] }])

    await user.click(tab(/disabled/i))
    expect(panelItems()).toHaveLength(2)
    await user.click(screen.getByRole('checkbox', { name: 'Enable test-bank:charge' }))
    await screen.findByText('Enabled (1)')
    expect(api.patternUpdates.at(-1)).toEqual({ enable: ['test-bank:charge'] })
  })

  it('says when a tab is empty', async () => {
    api.patterns = api.patterns.filter((p) => p.status === 'enabled')
    const { user } = renderApp('/learn')
    await stored()
    await user.click(tab(/disabled/i))
    expect(screen.getByRole('tabpanel')).toHaveTextContent('No disabled patterns.')
  })

  it('shows a failed toggle and keeps the pattern where it was', async () => {
    server.use(
      http.patch('*/api/patterns', () => HttpResponse.json({ error: 'failed to update patterns' }, { status: 500 })),
    )
    const { user } = renderApp('/learn')
    await stored()
    await user.click(screen.getByRole('checkbox', { name: 'Enable test-bank:charge' }))
    expect(await within(await stored()).findByRole('alert')).toHaveTextContent('failed to update patterns')
    expect(tab(/enabled/i)).toHaveTextContent('Enabled (1)')
  })

  it('shows why the patterns could not be loaded', async () => {
    server.use(
      http.get('*/api/patterns', () => HttpResponse.json({ error: 'failed to list patterns' }, { status: 500 })),
    )
    renderApp('/learn')
    expect(await screen.findByText('failed to list patterns')).toBeInTheDocument()
    expect(learnButton()).toBeEnabled()
  })
})
