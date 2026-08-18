import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import { basename } from 'node:path'
import { create as tarCreate } from 'tar'

/**
 * Sortir un fichier ou un dossier du serveur.
 *
 * Un dossier part en archive : c'est le seul moyen de récupérer un monde
 * entier depuis un navigateur. Tout passe en flux, sans jamais charger le
 * contenu en mémoire.
 */
export default defineEventHandler(async (event) => {
  const row = requireServerRow(getRouterParam(event, 'id')!)
  const rel = getQuery(event).path
  if (typeof rel !== 'string' || !rel) {
    throw createError({ statusCode: 400, statusMessage: 'Aucun fichier indiqué.' })
  }

  const target = safeJoin(row.data_dir, rel)
  const info = await stat(target).catch(() => null)
  if (!info) {
    throw createError({ statusCode: 404, statusMessage: 'Ce fichier n’existe pas.' })
  }

  const name = basename(target) || row.id

  if (info.isDirectory()) {
    setHeaders(event, {
      'Content-Type': 'application/gzip',
      'Content-Disposition': `attachment; filename="${name}.tar.gz"`,
    })
    // La taille d'une archive n'est connue qu'une fois produite : on l'envoie
    // sans Content-Length plutôt que de la fabriquer deux fois.
    return sendStream(event, tarCreate({ gzip: true, cwd: target }, ['.']) as any)
  }

  setHeaders(event, {
    'Content-Type': 'application/octet-stream',
    'Content-Length': String(info.size),
    'Content-Disposition': `attachment; filename="${name}"`,
  })
  return sendStream(event, createReadStream(target))
})
