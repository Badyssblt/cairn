import { mkdir, writeFile, stat } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { unzipSync } from 'fflate'

/** Au-delà, l'envoi passe mieux par SSH que par un navigateur. */
const MAX_BYTES = 512 * 1024 * 1024

/**
 * Dépose un monde par archive .zip plutôt que fichier par fichier.
 *
 * Deux formes circulent : soit l'archive contient `level.dat` à sa racine
 * (un export brut du dossier de monde), soit elle contient un unique dossier
 * qui le contient (le dossier de monde zippé tel quel). Les deux doivent
 * atterrir au même endroit — `<dataDir>/<name>` — sans quoi le monde ne
 * serait pas reconnu comme tel par `listWorlds`.
 */
export default defineEventHandler(async (event) => {
  const row = requireServerRow(getRouterParam(event, 'id')!)
  if (row.game !== 'minecraft') {
    throw createError({ statusCode: 400, statusMessage: 'La gestion des mondes est propre à Minecraft.' })
  }

  const parts = await readMultipartFormData(event)
  const nameField = parts?.find((p) => p.name === 'name' && !p.filename)
  const file = parts?.find((p) => p.name === 'file' && p.filename)

  const name = nameField?.data.toString('utf8').trim() ?? ''
  if (!name || !/^[\w .-]+$/.test(name)) {
    throw createError({ statusCode: 400, statusMessage: 'Nom de monde invalide.' })
  }
  if (!file) {
    throw createError({ statusCode: 400, statusMessage: 'Aucune archive reçue.' })
  }
  if (!/\.zip$/i.test(file.filename ?? '')) {
    throw createError({ statusCode: 400, statusMessage: 'Seules les archives .zip sont acceptées.' })
  }
  if (file.data.length > MAX_BYTES) {
    throw createError({
      statusCode: 413,
      statusMessage: `« ${file.filename} » dépasse 512 Mo. Passe par SSH pour un monde de cette taille.`,
    })
  }

  const dest = safeJoin(row.data_dir, name)
  if (await stat(dest).catch(() => null)) {
    throw createError({
      statusCode: 409,
      statusMessage: `« ${name} » existe déjà. Choisis un autre nom, ou supprime-le d'abord dans le gestionnaire de fichiers.`,
    })
  }

  const entries = unzipSync(new Uint8Array(file.data))
  const paths = Object.keys(entries)

  // Si tout tient sous un même dossier racine, on le retire : c'est lui qui
  // devient `<name>`, pas un sous-dossier dedans.
  const firstSegment = paths[0]?.split('/')[0]
  const singleRoot =
    firstSegment !== undefined && paths.every((p) => p === firstSegment || p.startsWith(`${firstSegment}/`))
      ? firstSegment
      : null

  const hasLevelDat = (root: string | null) =>
    paths.includes(root ? `${root}/level.dat` : 'level.dat')

  const strip = hasLevelDat(singleRoot) ? singleRoot : hasLevelDat(null) ? null : undefined
  if (strip === undefined) {
    throw createError({
      statusCode: 400,
      statusMessage: "Cette archive ne contient pas de monde valide : level.dat est introuvable.",
    })
  }

  const root = resolve(dest)
  for (const [entryPath, content] of Object.entries(entries)) {
    if (entryPath.endsWith('/') || content.length === 0) continue

    const relative = strip ? entryPath.slice(strip.length + 1) : entryPath
    if (!relative) continue

    const out = resolve(dest, relative)
    if (out !== root && !out.startsWith(root + '/')) continue

    await mkdir(dirname(out), { recursive: true })
    await writeFile(out, content)
  }

  return { ok: true, name }
})
