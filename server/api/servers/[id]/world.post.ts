import { rm, readdir } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { z } from 'zod'

const Body = z.object({
  action: z.literal('reset'),
  /** Graine du nouveau monde. Vide = aléatoire. */
  seed: z.string().trim().max(64).optional(),
  /** Retape le nom du serveur : un monde effacé ne se récupère pas. */
  confirm: z.string(),
})

/**
 * Réinitialise le monde en gardant les mods et la configuration.
 *
 * C'est le besoin « nouvelle saison » : on repart d'une carte vierge sans
 * refaire l'installation. Le serveur régénère le monde au démarrage suivant.
 */
export default defineEventHandler(async (event) => {
  const row = requireServerRow(getRouterParam(event, 'id')!)

  const parsed = Body.safeParse(await readBody(event))
  if (!parsed.success) {
    throw createError({ statusCode: 400, statusMessage: 'Requête invalide.' })
  }
  if (parsed.data.confirm.trim() !== row.name) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Retape exactement le nom du serveur pour confirmer.',
    })
  }

  const status = await containerStatus(row.id)
  if (status.exists && status.state !== 'stopped') {
    closeRcon(row.id)
    await stopContainer(row.id)
  }

  // Le nom du monde est réglable : on l'efface là où le serveur le range,
  // et on retire aussi les dimensions séparées de certains modloaders.
  const props = await readProperties(row.data_dir)
  const levelName = props.find((p) => p.key === 'level-name')?.value || 'world'
  const dir = resolve(row.data_dir)

  const targets = (await readdir(dir).catch(() => [])).filter(
    (n) => n === levelName || n.startsWith(`${levelName}_`),
  )
  for (const t of targets) await rm(join(dir, t), { recursive: true, force: true })

  if (parsed.data.seed !== undefined) {
    await writeProperties(row.data_dir, { 'level-seed': parsed.data.seed })
  }

  // On ne redémarre pas : la régénération d'un monde peut être longue, et
  // l'utilisateur doit pouvoir vérifier avant de la lancer.
  return { ok: true, removed: targets }
})
