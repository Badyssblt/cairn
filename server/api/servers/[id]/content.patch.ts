import { z } from 'zod'

const Body = z.object({
  filename: z.string().trim().min(1).max(200),
  disabled: z.boolean(),
  /**
   * Relancer dans la foulée. Un mod désactivé sur un serveur qui tourne ne
   * change rien tant qu'il n'a pas rechargé : proposer la désactivation sans
   * le redémarrage laisserait croire que c'est réglé.
   */
  restart: z.boolean().default(false),
})

export default defineEventHandler(async (event) => {
  const row = requireServerRow(getRouterParam(event, 'id')!)

  const parsed = Body.safeParse(await readBody(event))
  if (!parsed.success) {
    throw createError({ statusCode: 400, statusMessage: 'Requête invalide.' })
  }
  const { filename, disabled, restart } = parsed.data

  const result = await setContentDisabled(row, filename, disabled)

  let restarted = false
  if (restart) {
    const status = await containerStatus(row.id)
    if (status.exists) {
      closeRcon(row.id)
      await restartContainer(row.id)
      restarted = true
    }
  }

  return { ...result, restarted }
})
