import { z } from 'zod'
import { join, resolve } from 'node:path'
import { stat } from 'node:fs/promises'

const Body = z.object({
  // Un nom de dossier, jamais un chemin : `world/../..` sortirait du serveur.
  name: z.string().trim().min(1).max(64).regex(/^[\w .-]+$/, 'Nom de monde invalide.'),
})

/**
 * Change le monde chargé au démarrage.
 *
 * C'est un simple `level-name` dans server.properties, mais fait à la main ce
 * réglage se trompe facilement : le serveur ne dit rien si le dossier n'existe
 * pas, il en génère un neuf du même nom. On perd alors sa partie sans le
 * moindre message d'erreur — d'où la vérification avant écriture.
 */
export default defineEventHandler(async (event) => {
  const row = requireServerRow(getRouterParam(event, 'id')!)

  const parsed = Body.safeParse(await readBody(event))
  if (!parsed.success) {
    throw createError({
      statusCode: 400,
      statusMessage: parsed.error.issues[0]?.message ?? 'Requête invalide.',
    })
  }
  const { name } = parsed.data

  const dat = join(resolve(row.data_dir), name, 'level.dat')
  const exists = await stat(dat).catch(() => null)
  if (!exists?.isFile()) {
    throw createError({
      statusCode: 404,
      statusMessage:
        `« ${name} » ne contient pas de level.dat : ce n'est pas un monde. ` +
        `Le serveur en aurait généré un vide sous ce nom.`,
    })
  }

  const status = await containerStatus(row.id)
  if (status.exists && status.state === 'running') {
    throw createError({
      statusCode: 409,
      statusMessage:
        'Arrête le serveur avant de changer de monde : il réécrirait ' +
        'server.properties en s’arrêtant, et le changement serait perdu.',
    })
  }

  await writeProperties(row.data_dir, { 'level-name': name })
  return { ok: true, levelName: name }
})
