import { z } from 'zod'

const Body = z.object({ enabled: z.boolean() })

export default defineEventHandler(async (event) => {
  requireServerRow(getRouterParam(event, 'id')!)
  const parsed = Body.safeParse(await readBody(event))
  if (!parsed.success) {
    throw createError({ statusCode: 400, statusMessage: 'Requête invalide.' })
  }
  setScheduleEnabled(getRouterParam(event, 'scheduleId')!, parsed.data.enabled)
  return { ok: true }
})
