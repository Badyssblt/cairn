import { z } from 'zod'

const Body = z.object({ project: z.string().trim().min(1) })

export default defineEventHandler(async (event) => {
  const row = requireServerRow(getRouterParam(event, 'id')!)

  const parsed = Body.safeParse(await readBody(event))
  if (!parsed.success) {
    throw createError({ statusCode: 400, statusMessage: 'Aucune extension indiquée.' })
  }

  const res = await installContent(row, parsed.data.project)

  // Le fichier est en place mais la JVM ne le relira qu'au prochain démarrage :
  // le dire évite de croire à un échec en ne voyant rien changer en jeu.
  return { ...res, needsRestart: true }
})
