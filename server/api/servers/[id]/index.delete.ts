import { rm } from 'node:fs/promises'
import { resolve } from 'node:path'

/**
 * Supprime le serveur. Le monde n'est effacé que si `purge` est demandé
 * explicitement : par défaut on retire le conteneur et on garde les fichiers,
 * parce qu'un monde perdu ne se récupère pas.
 */
export default defineEventHandler(async (event) => {
  const row = requireServerRow(getRouterParam(event, 'id')!)
  const purge = getQuery(event).purge === 'true'

  closeRcon(row.id)
  await removeContainer(row.id)

  if (purge) {
    // Garde-fou : ne jamais effacer hors de la racine des données, quoi
    // qu'il y ait en base.
    const root = resolve(useRuntimeConfig().dataRoot)
    const dir = resolve(row.data_dir)
    if (dir.startsWith(root + '/') && dir !== root) {
      await rm(dir, { recursive: true, force: true })
    }
  }

  useDb().prepare('DELETE FROM servers WHERE id = ?').run(row.id)
  return { deleted: row.id, purged: purge }
})
