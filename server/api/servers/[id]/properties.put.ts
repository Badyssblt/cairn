import { z } from 'zod'

const Body = z.object({
  updates: z.record(z.string(), z.string()).optional(),
  content: z.string().optional(),
})

export default defineEventHandler(async (event) => {
  const row = requireServerRow(getRouterParam(event, 'id')!)
  const adapter = gameAdapter(row.game)
  const ctx = gameContext(row)
  const spec = gameConfigFile(adapter, ctx)

  if (!spec) {
    throw createError({
      statusCode: 400,
      statusMessage: `${adapter.name} n'expose pas de fichier de configuration ici.`,
    })
  }

  const parsed = Body.safeParse(await readBody(event))
  if (!parsed.success) {
    throw createError({ statusCode: 400, statusMessage: 'Modifications invalides.' })
  }

  if (spec.format === 'properties') {
    if (!parsed.data.updates) {
      throw createError({ statusCode: 400, statusMessage: 'Aucune modification.' })
    }
    const properties = await readProperties(row.data_dir)
    if (!properties.length) {
      throw createError({
        statusCode: 409,
        statusMessage:
          "Le fichier n'existe pas encore. Démarre le serveur une première fois.",
      })
    }
    await writeProperties(row.data_dir, parsed.data.updates)
  } else if (spec.format === 'lgsm') {
    if (!parsed.data.updates) {
      throw createError({ statusCode: 400, statusMessage: 'Aucune modification.' })
    }
    const service = lgsmService(ctx)
    const current = await readLgsmConfig(row.data_dir, service)
    const defaults = Object.fromEntries(
      current.entries.map((e) => [e.key, e.defaultValue]),
    )
    // On repart de l'état effectif : n'envoyer que les champs modifiés ne doit
    // pas effacer les surcharges posées précédemment.
    const values = Object.fromEntries(current.entries.map((e) => [e.key, e.value]))
    Object.assign(values, parsed.data.updates)

    await writeLgsmOverrides(row.data_dir, service, values, defaults)
  } else {
    if (parsed.data.content === undefined) {
      throw createError({ statusCode: 400, statusMessage: 'Aucun contenu.' })
    }
    await writeTextFile(row.data_dir, spec.path, parsed.data.content)
  }

  // Le fichier n'est relu qu'au démarrage : le dire évite de croire que le
  // changement est déjà actif en jeu.
  return { ok: true, requiresRestart: true }
})
