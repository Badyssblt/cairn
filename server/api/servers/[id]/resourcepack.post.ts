import { z } from 'zod'

const Body = z.object({
  /** Vide = retirer le pack de ressources. */
  url: z.string().trim().max(1000),
  required: z.boolean().default(false),
})

/**
 * Règle le pack de ressources, empreinte comprise.
 *
 * `resource-pack-sha1` est ce qui permet au client de savoir que le pack a
 * changé. Sans elle il le retélécharge à chaque connexion ; fausse, il le
 * refuse. Elle se calcule en téléchargeant le fichier — ce que le panneau fait
 * ici une fois, plutôt que de laisser l'utilisateur lancer `sha1sum` et coller
 * quarante caractères à la main.
 */
export default defineEventHandler(async (event) => {
  const row = requireServerRow(getRouterParam(event, 'id')!)
  if (row.game !== 'minecraft') {
    throw createError({ statusCode: 400, statusMessage: 'Réglage propre à Minecraft.' })
  }

  const parsed = Body.safeParse(await readBody(event))
  if (!parsed.success) {
    throw createError({ statusCode: 400, statusMessage: 'Requête invalide.' })
  }
  const { url, required } = parsed.data

  if (!url) {
    await writeProperties(row.data_dir, {
      'resource-pack': '',
      'resource-pack-sha1': '',
      'require-resource-pack': 'false',
    })
    return { ok: true, cleared: true }
  }

  if (!/^https?:\/\//i.test(url)) {
    throw createError({
      statusCode: 400,
      statusMessage: "L'adresse doit commencer par http:// ou https://.",
    })
  }

  const pack = await fetchResourcePackHash(url)

  await writeProperties(row.data_dir, {
    'resource-pack': pack.url,
    'resource-pack-sha1': pack.sha1,
    'require-resource-pack': required ? 'true' : 'false',
  })

  return { ok: true, cleared: false, ...pack }
})
