import { z } from 'zod'
import type {
  CategoryBudgetRequest,
  CategoryRequest,
  MerchantCategoryRequest,
  ReorderCategoriesRequest,
} from '@wealthi/shared'
import { numberToMinor, type Minor } from '../utils/money'
import { validate, type Validated } from './transactions'

/** Postgres INTEGER's ceiling: anything above can't be a stored id, and would fail the query instead. */
const INT4_MAX = 2_147_483_647

const ID_ERROR = 'must be a category id (a positive integer)'

/** A category id in a JSON body. */
export const categoryId = (name: string) =>
  z.int({ error: `${name} ${ID_ERROR}` }).min(1, { error: `${name} ${ID_ERROR}` }).max(INT4_MAX, { error: `${name} ${ID_ERROR}` }) // prettier-ignore

/** A category id in the path: digits only, so "1e3" or " 7" never become one. */
const IdParamSchema = z
  .string({ error: `id ${ID_ERROR}` })
  .regex(/^\d{1,10}$/, { error: `id ${ID_ERROR}` })
  .transform(Number)
  .pipe(categoryId('id'))

/** Trimmed, so " Food" and "Food" are one name. */
const CategoryRequestSchema = z.object(
  {
    name: z
      .string({ error: 'name must be a string' })
      .trim()
      .min(1, { error: 'name is required' })
      .max(40, { error: 'name must be at most 40 characters' }),
  },
  { error: 'body must be { name }' },
) satisfies z.ZodType<CategoryRequest, unknown>

const BudgetSchema = z.object(
  {
    budget: z
      .number({ error: 'budget must be a number, or null to clear it' })
      .min(0, { error: 'budget must not be negative' })
      .nullable(),
  },
  { error: 'body must be { budget }' },
) satisfies z.ZodType<CategoryBudgetRequest, unknown>

const ReorderSchema = z
  .object(
    { ids: z.array(categoryId('each id'), { error: 'ids must be an array of category ids' }) },
    { error: 'body must be { ids }' },
  )
  .refine((r) => new Set(r.ids).size === r.ids.length, { error: 'ids must not repeat' }) satisfies z.ZodType<
  ReorderCategoriesRequest,
  unknown
>

const MerchantCategorySchema = z.object(
  {
    // Not trimmed: merchant strings are exact, as the bank prints them.
    merchant: z.string({ error: 'merchant must be a string' }).min(1, { error: 'merchant is required' }),
    categoryId: categoryId('categoryId').nullable(),
  },
  { error: 'body must be { merchant, categoryId }' },
) satisfies z.ZodType<MerchantCategoryRequest, unknown>

const CategoryUpdateSchema = z.object({
  // Express types route params as `string | string[]`; a plain `:id` is always
  // a single value, so anything else is malformed.
  id: z.guid({ error: 'id must be a UUID' }),
  // Whether it names a stored category is the foreign key's to decide (db/transactions.ts).
  categoryId: z.union([categoryId('categoryId'), z.null()], {
    error: (issue) =>
      issue.input === undefined ? 'categoryId is required (use null to clear it)' : `categoryId ${ID_ERROR}`,
  }),
})

/**
 * The transaction id and category from a PATCH /api/transactions/:id/category
 * request; `null` clears the category.
 */
export function parseCategoryUpdate(id: unknown, body: unknown): Validated<{ id: string; categoryId: number | null }> {
  const value = typeof body === 'object' && body !== null && 'categoryId' in body ? body.categoryId : undefined
  return validate(CategoryUpdateSchema, { id, categoryId: value })
}

/** The id from a /api/categories/:id path. */
export function parseCategoryId(id: unknown): Validated<number> {
  return validate(IdParamSchema, id)
}

/** The name from a POST /api/categories or PATCH /api/categories/:id body. */
export function parseCategoryRequest(body: unknown): Validated<CategoryRequest> {
  return validate(CategoryRequestSchema, body)
}

/** The new order from a PUT /api/categories/order body. */
export function parseReorder(body: unknown): Validated<ReorderCategoriesRequest> {
  return validate(ReorderSchema, body)
}

/** The mapping from a PUT /api/merchant-categories body. */
export function parseMerchantCategory(body: unknown): Validated<MerchantCategoryRequest> {
  return validate(MerchantCategorySchema, body)
}

/** The budget from a PUT /api/categories/:id/budget body, in minor units; `null` clears it. */
export function parseBudget(body: unknown): Validated<{ budget: Minor | null }> {
  const parsed = validate(BudgetSchema, body)
  if ('error' in parsed) return parsed
  if (parsed.value.budget === null) return { value: { budget: null } }
  const minor = numberToMinor(parsed.value.budget)
  return minor.ok ? { value: { budget: minor.value } } : { error: `budget: ${minor.error}` }
}
