import { mkdir, writeFile } from 'node:fs/promises'
import { basename, join } from 'node:path'

/** Un datapack qui dépasse ça n'en est plus un. */
const MAX_BYTES = 64 * 1024 * 1024

/**
 * Dépose un datapack dans le monde chargé, puis le recharge.
 *
 * Le dossier de destination est calculé à partir de `level-name` : c'est ce
 * que l'on se trompe systématiquement à faire à la main, parce qu'un datapack
 * posé au mauvais endroit ne provoque aucune erreur — il est simplement ignoré.
 */
export default defineEventHandler(async (event) => {
  const row = requireServerRow(getRouterParam(event, 'id')!)
  if (row.game !== 'minecraft') {
    throw createError({ statusCode: 400, statusMessage: 'Les datapacks sont propres à Minecraft.' })
  }

  const parts = await readMultipartFormData(event)
  const files = (parts ?? []).filter((p) => p.filename)
  if (!files.length) {
    throw createError({ statusCode: 400, statusMessage: 'Aucun fichier reçu.' })
  }

  const dir = await datapacksDir(row)
  await mkdir(dir, { recursive: true })

  const written: string[] = []
  for (const file of files) {
    // Le nom vient du navigateur : n'en garder que le dernier segment interdit
    // de remonter hors du dossier du monde.
    const name = basename(file.filename!).replace(/[/\\]/g, '')
    if (!name || name.startsWith('.')) continue

    if (!name.toLowerCase().endsWith('.zip')) {
      throw createError({
        statusCode: 400,
        statusMessage: `« ${name} » n'est pas une archive .zip. Un datapack se dépose tel qu'il est distribué, sans le décompresser.`,
      })
    }
    if (file.data.length > MAX_BYTES) {
      throw createError({
        statusCode: 413,
        statusMessage: `« ${name} » dépasse 64 Mo : ce n'est probablement pas un datapack.`,
      })
    }

    await writeFile(join(dir, name), file.data)
    written.push(name)
  }

  if (!written.length) {
    throw createError({ statusCode: 400, statusMessage: 'Aucun fichier exploitable.' })
  }

  // `/reload` prend les datapacks à chaud. S'il échoue — serveur arrêté — on
  // le dit, plutôt que de laisser croire que le pack est déjà actif.
  const reloaded = await reloadDatapacks(row)

  return { written, reloaded }
})
