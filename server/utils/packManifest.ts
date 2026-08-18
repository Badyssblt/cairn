import { readFile, unlink, writeFile } from 'node:fs/promises'
import { join, resolve, sep } from 'node:path'

/**
 * Trace de ce que le modpack a posé dans le dossier du serveur.
 *
 * Sans elle, une mise à jour serait dangereuse : les nouveaux mods
 * s'ajouteraient aux anciens au lieu de les remplacer, et le serveur
 * refuserait de démarrer avec deux versions du même mod. On ne peut pas non
 * plus vider `mods/` aveuglément — on effacerait les mods ajoutés à la main.
 *
 * On note donc précisément les fichiers installés, pour ne retirer que ceux-là.
 */
const FILE = '.minemanager-pack.json'

export interface PackManifest {
  source: string
  project: string
  version: string
  installedAt: number
  /** Chemins relatifs au dossier du serveur. */
  files: string[]
}

export async function readManifest(dataDir: string): Promise<PackManifest | null> {
  try {
    return JSON.parse(await readFile(join(dataDir, FILE), 'utf8')) as PackManifest
  } catch {
    return null
  }
}

export async function writeManifest(dataDir: string, manifest: PackManifest) {
  await writeFile(join(dataDir, FILE), JSON.stringify(manifest, null, 2), 'utf8')
}

/**
 * Retire les fichiers d'une installation précédente.
 *
 * Les chemins sont revérifiés avant suppression : un manifeste altéré ne doit
 * pas pouvoir faire effacer quoi que ce soit hors du dossier du serveur.
 */
export async function removeManifestFiles(
  dataDir: string,
  manifest: PackManifest,
): Promise<number> {
  const root = resolve(dataDir)
  let removed = 0

  for (const rel of manifest.files) {
    const target = resolve(root, rel)
    if (!target.startsWith(root + sep)) continue
    try {
      await unlink(target)
      removed++
    } catch {
      // déjà absent : rien à faire
    }
  }
  return removed
}
