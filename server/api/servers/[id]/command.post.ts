import { z } from 'zod'

const Body = z.object({ command: z.string().trim().min(1).max(500) })

/**
 * Envoie une commande au serveur par RCON et renvoie sa réponse.
 * C'est aussi ce que la console utilise pour l'entrée clavier.
 */
export default defineEventHandler(async (event) => {
  const row = requireServerRow(getRouterParam(event, 'id')!)

  const parsed = Body.safeParse(await readBody(event))
  if (!parsed.success) {
    throw createError({ statusCode: 400, statusMessage: 'Commande vide.' })
  }

  const rcon = await serverRcon(row)
  if (!rcon) {
    throw createError({
      statusCode: 409,
      statusMessage: 'Ce serveur ne tourne pas. Démarre-le pour lui envoyer une commande.',
    })
  }

  try {
    // La barre oblique est optionnelle côté RCON : on l'accepte et on l'ôte.
    const cmd = parsed.data.command.replace(/^\//, '')
    return { response: await rcon.command(cmd) }
  } catch (e: any) {
    throw createError({
      statusCode: 502,
      statusMessage: `Le serveur n'a pas répondu : ${e?.message ?? 'erreur RCON'}`,
    })
  }
})
