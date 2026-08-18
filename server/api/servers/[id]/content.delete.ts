import { z } from 'zod'

const Body = z.object({ filename: z.string().trim().min(1) })

export default defineEventHandler(async (event) => {
  const row = requireServerRow(getRouterParam(event, 'id')!)

  const parsed = Body.safeParse(await readBody(event))
  if (!parsed.success) {
    throw createError({ statusCode: 400, statusMessage: 'Aucun fichier indiqué.' })
  }

  const res = await removeContent(row, parsed.data.filename)
  return { ...res, needsRestart: true }
})
