/**
 * importFromChatDb deletes every row in `transactions` and `monthly_balances`.
 * Refuse any database whose name doesn't end in `_test`, so a stray
 * DATABASE_URL can never point the suite at your real ledger.
 */
export function assertTestDatabase(url: string): void {
  const name = new URL(url).pathname.replace(/^\//, '')
  if (!name.endsWith('_test')) {
    throw new Error(`Refusing to run integration tests against database "${name}": its name must end in "_test".`)
  }
}
