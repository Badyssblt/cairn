import { z } from 'zod'

const Body = z.object({ version: z.string().trim().min(1) })

/**
 * Change la version du modpack en conservant le monde.
 *
 * Le serveur est arrêté d'abord : remplacer des mods sous un serveur qui tourne
 * corromprait au mieux le chargement, au pire la sauvegarde en cours.
 */
export default defineEventHandler(async (event) => {
  const row = requireServerRow(getRouterParam(event, 'id')!)

  if (row.type !== 'MODPACK' || !row.modpack_project) {
    throw createError({
      statusCode: 400,
      statusMessage: "Ce serveur n'est pas un modpack.",
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
    throw createError({ statusCode: 400, statusMessage: 'Version invalide.' })
  }
  const version = parsed.data.version
  if (version === row.modpack_version) {
    return { ok: true, unchanged: true }
  }

  const status = await containerStatus(row.id)
  if (status.exists && status.state !== 'stopped') {
    closeRcon(row.id)
    await stopContainer(row.id)
  }

  useDb()
    .prepare(
      `UPDATE servers
          SET modpack_version = ?, install_state = 'installing',
              install_step = 'Préparation', install_progress = 0, install_error = NULL
        WHERE id = ?`,
    )
    .run(version, row.id)

  const updated = requireServerRow(row.id)

  if (updated.modpack_source === 'CURSEFORGE') {
    // Le téléchargement dure : on rend la main et l'avancement se suit
    // comme à la création.
    startInstall(updated, updated.host_port, updated.memory_mb)
  } else {
    // Modrinth est installé par itzg : il suffit de recréer le conteneur avec
    // la nouvelle version, l'image s'occupe du reste au démarrage.
    await applyModrinthVersion(updated)
  }

  return { ok: true, unchanged: false }
})
