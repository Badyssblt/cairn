import { z } from 'zod'

const Body = z.object({
  name: z.string().trim().max(60).optional(),
  scope: z.enum(['full', 'world']).default('full'),
})

export default defineEventHandler(async (event) => {
  const row = requireServerRow(getRouterParam(event, 'id')!)
  const parsed = Body.safeParse((await readBody(event)) ?? {})
  const input = parsed.success ? parsed.data : { name: undefined, scope: 'full' as const }

  // Rend la main tout de suite : archiver un modpack prend des minutes.
  const id = startBackup(row, input.name, input.scope)
  return { id }
})
