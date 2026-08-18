import { z } from 'zod'

const Body = z.object({
  confirm: z.literal(true),
  type: z.enum(['VANILLA', 'PAPER', 'FORGE', 'FABRIC', 'MODPACK']),
  mcVersion: z.string().trim().max(20).default('LATEST'),
  modpackSource: z.enum(['MODRINTH', 'CURSEFORGE']).optional().nullable(),
  modpackProject: z.string().trim().optional().nullable(),
  modpackVersion: z.string().trim().optional().nullable(),
  modpackLoader: z.string().trim().optional().nullable(),
  modpackName: z.string().trim().optional().nullable(),
  modpackIcon: z.string().trim().url().optional().nullable(),
})

/**
 * Change le type d'un serveur Minecraft (ex. Paper -> un modpack) : le monde,
 * les mods/plugins et la configuration en place sont perdus, une installation
 * neuve démarre à la place. `confirm` est redondant avec le modal du panneau,
 * gardé ici parce qu'une action aussi définitive ne doit pas dépendre
 * uniquement de ce que l'interface a bien voulu envoyer.
 */
export default defineEventHandler(async (event) => {
  const row = requireServerRow(getRouterParam(event, 'id')!)

  if (row.game !== 'minecraft') {
    throw createError({
      statusCode: 400,
      statusMessage: 'Ce jeu ne connaît qu’un seul type de serveur.',
    })
  }
  if (row.install_state === 'installing') {
    throw createError({
      statusCode: 409,
      statusMessage: 'Une installation est déjà en cours sur ce serveur.',
    })
  }

  const parsed = Body.safeParse(await readBody(event))
  if (!parsed.success) {
    throw createError({
      statusCode: 400,
      statusMessage: parsed.error.issues[0]?.message ?? 'Formulaire incomplet.',
    })
  }
  const input = parsed.data

  if (input.type === 'MODPACK' && !input.modpackProject) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Choisis un modpack avant de continuer.',
    })
  }

  const status = await containerStatus(row.id)
  if (status.exists && status.state !== 'stopped') {
    closeRcon(row.id)
    await stopContainer(row.id)
  }

  await wipeServerData(row.data_dir)

  const isCurseforge = input.type === 'MODPACK' && input.modpackSource === 'CURSEFORGE'

  useDb()
    .prepare(
      `UPDATE servers
          SET type = ?, mc_version = ?, modpack_name = ?, modpack_source = ?,
              modpack_project = ?, modpack_version = ?, modpack_loader = ?,
              loader = NULL, loader_version = NULL,
              disk_used_mb = NULL, disk_checked_at = NULL,
              install_state = ?, install_step = ?, install_progress = ?, install_error = NULL
        WHERE id = ?`,
    )
    .run(
      input.type,
      input.mcVersion,
      input.modpackName ?? null,
      input.type === 'MODPACK' ? (input.modpackSource ?? 'MODRINTH') : null,
      input.modpackProject ?? null,
      input.modpackVersion ?? null,
      input.modpackLoader ?? null,
      isCurseforge ? 'installing' : null,
      isCurseforge ? 'Préparation' : null,
      isCurseforge ? 0 : null,
      row.id,
    )

  const updated = requireServerRow(row.id)

  if (isCurseforge) {
    // Le téléchargement dure : on rend la main, l'avancement se suit comme à
    // la création.
    startInstall(updated, updated.host_port, updated.memory_mb)
  } else {
    // Vanilla/Paper/Forge/Fabric ou modpack Modrinth : itzg installe au
    // démarrage, il suffit de recréer le conteneur avec les nouvelles valeurs.
    await recreateServerContainer(updated)
    await startContainer(updated.id)
  }

  return { ok: true }
})
