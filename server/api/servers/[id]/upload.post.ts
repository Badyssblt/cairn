import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'

/** Au-delà, l'envoi passe mieux par SSH que par un navigateur. */
const MAX_BYTES = 256 * 1024 * 1024

/**
 * Dépôt de fichiers dans le dossier du serveur.
 *
 * C'est ce qui manquait pour installer un mod, un plugin ou un datapack à la
 * main : le gestionnaire savait lire et modifier, mais pas ajouter.
 */
export default defineEventHandler(async (event) => {
  const row = requireServerRow(getRouterParam(event, 'id')!)

  const parts = await readMultipartFormData(event)
  if (!parts?.length) {
    throw createError({ statusCode: 400, statusMessage: 'Aucun fichier reçu.' })
  }

  // Le dossier de destination voyage avec les fichiers, dans le même envoi.
  const dest = parts.find((p) => p.name === 'path' && !p.filename)
  const relDir = dest ? dest.data.toString('utf8') : ''

  const files = parts.filter((p) => p.filename)
  if (!files.length) {
    throw createError({ statusCode: 400, statusMessage: 'Aucun fichier reçu.' })
  }

  const written: string[] = []
  for (const file of files) {
    if (file.data.length > MAX_BYTES) {
      throw createError({
        statusCode: 413,
        statusMessage: `« ${file.filename} » dépasse 256 Mo. Passe par SSH pour un fichier de cette taille.`,
      })
    }

    // Le nom vient du navigateur : glisser un dossier y ajoute son chemin
    // relatif (`sous-dossier/fichier.txt`), qu'on préserve pour recréer
    // l'arborescence — mais chaque segment `.`/`..` est écarté, pour qu'un
    // chemin piégé ne puisse pas remonter hors du dossier du serveur.
    const relFile = (file.filename ?? 'fichier')
      .replace(/\\/g, '/')
      .split('/')
      .filter((seg) => seg && seg !== '.' && seg !== '..')
      .join('/')
    if (!relFile) continue

    const target = safeJoin(row.data_dir, join(relDir, relFile))

    await mkdir(dirname(target), { recursive: true })
    await writeFile(target, file.data)
    written.push(relFile)
  }

  return { ok: true, written }
})
