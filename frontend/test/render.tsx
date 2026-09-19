import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactElement } from 'react'
import { MemoryRouter, useLocation } from 'react-router-dom'
import App from '../src/App'

/** Shows the current path + query string, so tests can assert what the URL says. */
function LocationProbe() {
  const { pathname, search } = useLocation()
  return <output data-testid="location">{pathname + search}</output>
}

export function newQueryClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
}

/** Renders the whole app at `url`, as main.tsx does but with an in-memory router. */
export function renderApp(url: string) {
  const user = userEvent.setup()
  const utils = render(
    <QueryClientProvider client={newQueryClient()}>
      <MemoryRouter initialEntries={[url]}>
        <App />
        <LocationProbe />
      </MemoryRouter>
    </QueryClientProvider>,
  )
  return { user, ...utils }
}

/** Renders one component with the providers it may need; `rerender` keeps them. */
export function renderWithProviders(ui: ReactElement, url = '/') {
  const user = userEvent.setup()
  const client = newQueryClient()
  const utils = render(ui, {
    wrapper: ({ children }) => (
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={[url]}>
          {children}
          <LocationProbe />
        </MemoryRouter>
      </QueryClientProvider>
    ),
  })
  return { user, ...utils }
}

/** The current URL (path + query) of the in-memory router. */
export function currentUrl(): URL {
  const text = document.querySelector('[data-testid="location"]')?.textContent ?? '/'
  return new URL(text, 'http://app')
}
