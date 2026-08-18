import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'

export default defineEventHandler(async (event) => {
  const row = requireServerRow(getRouterParam(event, 'id')!)
  const backup = getBackup(getRouterParam(event, 'backupId')!)
  if (!backup || backup.server_id !== row.id) {
    throw createError({ statusCode: 404, statusMessage: 'Sauvegarde introuvable.' })
  }

  const info = await stat(backup.path).catch(() => null)
  if (!info) {
    throw createError({ statusCode: 410, statusMessage: "L'archive n'est plus sur le disque." })
  }

  setHeaders(event, {
    'Content-Type': 'application/gzip',
    'Content-Length': String(info.size),
    'Content-Disposition': `attachment; filename="${row.id}-${backup.id}.tar.gz"`,
  })
  // En flux : charger une archive de plusieurs gigaoctets en mémoire ferait
  // tomber le panneau.
  return sendStream(event, createReadStream(backup.path))
})
