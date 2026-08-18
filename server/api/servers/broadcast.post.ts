import { z } from 'zod'

const Body = z.object({ message: z.string().trim().min(1).max(200) })

/**
 * Diffuse un message à tous les serveurs en marche qui savent en afficher un.
 *
 * Même geste que l'annonce des tâches planifiées (schedules.ts) : c'est le
 * jeu qui construit la commande, RCON qui l'envoie. Un serveur sans console
 * de diffusion (LinuxGSM, la plupart) ou arrêté est ignoré plutôt que de
 * faire échouer toute la diffusion pour les autres.
 */
export default defineEventHandler(async (event) => {
  const parsed = Body.safeParse(await readBody(event))
  if (!parsed.success) {
    throw createError({ statusCode: 400, statusMessage: 'Message vide.' })
  }

  const rows = listServerRows()
  let sent = 0

  for (const row of rows) {
    const broadcast = gameAdapter(row.game).rcon?.broadcast
    if (!broadcast) continue

    const status = await containerStatus(row.id)
    if (status.state !== 'running') continue

    const rcon = await serverRcon(row).catch(() => null)
    if (!rcon) continue

    await rcon.command(broadcast(parsed.data.message)).catch(() => {})
    sent++
  }

  return { sent, total: rows.length }
})
