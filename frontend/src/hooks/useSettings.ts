import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'
import type { AccountRequest, AccountSourceRequest, AccountUpdateRequest, TransferRuleRequest } from '@wealthi/shared'
import {
  addBankSender,
  createAccount,
  createTransferRule,
  deleteAccount,
  deleteAccountSource,
  deleteBankSender,
  deleteTransferRule,
  fetchAccountSources,
  fetchBankSenders,
  fetchTransferRules,
  setAccountSource,
  updateAccount,
  updateTransferRule,
} from '../utils/api'

// Every account list in the app (useAccounts) shares ['accounts'], so an account
// write refetches it. The ledger only changes at the next import, so no
// transaction or balance view is refetched.
const ACCOUNTS_KEY = ['accounts']
const SOURCES_KEY = ['account-sources']
const RULES_KEY = ['transfer-rules']
const SENDERS_KEY = ['bank-senders']

const refetch = (queryClient: QueryClient, key: string[]) => void queryClient.invalidateQueries({ queryKey: key })

/** Adds an account. */
export function useCreateAccount() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (account: AccountRequest) => createAccount(account),
    onSuccess: () => refetch(queryClient, ACCOUNTS_KEY),
  })
}

/** Changes the label and opening balance of the account with `id`. */
export function useUpdateAccount() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, changes }: { id: string; changes: AccountUpdateRequest }) => updateAccount(id, changes),
    onSuccess: () => refetch(queryClient, ACCOUNTS_KEY),
  })
}

export function useDeleteAccount() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => deleteAccount(id),
    onSuccess: () => refetch(queryClient, ACCOUNTS_KEY),
  })
}

/** Every source key with its account. */
export function useAccountSources() {
  return useQuery({ queryKey: SOURCES_KEY, queryFn: ({ signal }) => fetchAccountSources(signal) })
}

/** Maps a source key to an account, moving it if it was mapped elsewhere. */
export function useSetAccountSource() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (mapping: AccountSourceRequest) => setAccountSource(mapping),
    onSuccess: () => refetch(queryClient, SOURCES_KEY),
  })
}

export function useDeleteAccountSource() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (source: string) => deleteAccountSource(source),
    onSuccess: () => refetch(queryClient, SOURCES_KEY),
  })
}

/** Every transfer rule, in the order the import tries them. */
export function useTransferRules() {
  return useQuery({ queryKey: RULES_KEY, queryFn: ({ signal }) => fetchTransferRules(signal) })
}

/** Stores a new transfer rule, or replaces the one with `id`. */
export function useSaveTransferRule() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, rule }: { id: number | null; rule: TransferRuleRequest }) =>
      id === null ? createTransferRule(rule) : updateTransferRule(id, rule),
    onSuccess: () => refetch(queryClient, RULES_KEY),
  })
}

export function useDeleteTransferRule() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => deleteTransferRule(id),
    onSuccess: () => refetch(queryClient, RULES_KEY),
  })
}

/** The chat.db handles SMS are imported and learned from. */
export function useBankSenders() {
  return useQuery({ queryKey: SENDERS_KEY, queryFn: ({ signal }) => fetchBankSenders(signal) })
}

export function useAddBankSender() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (sender: string) => addBankSender({ sender }),
    onSuccess: () => refetch(queryClient, SENDERS_KEY),
  })
}

export function useDeleteBankSender() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (sender: string) => deleteBankSender(sender),
    onSuccess: () => refetch(queryClient, SENDERS_KEY),
  })
}
