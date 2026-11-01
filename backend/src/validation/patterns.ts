import { z } from 'zod'
import type { UpdatePatternsRequest } from '@wealthi/shared'
import { validate, type Validated } from './transactions'

const ids = (name: string) =>
  z
    .array(
      z.string({ error: `${name} must be an array of pattern ids` }).min(1, { error: `${name} holds an empty id` }),
      {
        error: `${name} must be an array of pattern ids`,
      },
    )
    .default([])

const PatternStatusUpdateSchema = z
  .object({ enable: ids('enable'), disable: ids('disable') }, { error: 'body must be { enable?, disable? }' })
  .refine((u) => u.enable.length + u.disable.length > 0, { error: 'name at least one pattern to enable or disable' })
  .refine((u) => !u.enable.some((id) => u.disable.includes(id)), {
    error: 'a pattern cannot be both enabled and disabled',
  }) satisfies z.ZodType<Required<UpdatePatternsRequest>, unknown>

/** The ids to enable and disable from a PATCH /api/patterns body. */
export function parsePatternStatusUpdate(body: unknown): Validated<Required<UpdatePatternsRequest>> {
  return validate(PatternStatusUpdateSchema, body)
}
