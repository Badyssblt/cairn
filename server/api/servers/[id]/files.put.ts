import { z } from 'zod'

const Body = z.object({ path: z.string().min(1), content: z.string() })

export default defineEventHandler(async (event) => {
  const row = requireServerRow(getRouterParam(event, 'id')!)
  const parsed = Body.safeParse(await readBody(event))
  if (!parsed.success) {
    throw createError({ statusCode: 400, statusMessage: 'Enregistrement invalide.' })
  }

  await writeTextFile(row.data_dir, parsed.data.path, parsed.data.content)

  // Minecraft lit la plupart de ses fichiers au démarrage seulement.
  return { ok: true, requiresRestart: true }
})
