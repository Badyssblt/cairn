import { readdir, stat } from 'node:fs/promises'
import { join } from 'node:path'

/**
 * Taille d'un dossier de serveur.
 *
 * Le calcul parcourt toute l'arborescence : sur un modpack, c'est des dizaines
 * de milliers de fichiers. On ne le refait donc pas à chaque affichage, mais
 * toutes les dix minutes — une taille sur disque n'évolue pas plus vite que ça.
 */
const REFRESH_MS = 10 * 60 * 1000

export async function directorySizeMb(dir: string): Promise<number> {
  let total = 0

  async function walk(path: string) {
    let entries
    try {
      entries = await readdir(path, { withFileTypes: true })
    } catch {
      return
    }
    for (const e of entries) {
      const full = join(path, e.name)
      if (e.isDirectory()) {
        await walk(full)
      } else if (e.isFile()) {
        try {
          total += (await stat(full)).size
        } catch {
          // fichier disparu en cours de route : sans importance ici
        }
      }
    }
  }

  await walk(dir)
  return Math.round(total / 1024 / 1024)
}

/** Recalcule si la mesure est trop vieille. Renvoie la valeur connue sinon. */
export async function refreshDiskUsage(row: {
  id: string
  data_dir: string
  disk_used_mb: number | null
  disk_checked_at: number | null
}): Promise<number | null> {
  const fresh = row.disk_checked_at && Date.now() - row.disk_checked_at < REFRESH_MS
  if (fresh) return row.disk_used_mb

  const mb = await directorySizeMb(row.data_dir)
  useDb()
    .prepare('UPDATE servers SET disk_used_mb = ?, disk_checked_at = ? WHERE id = ?')
    .run(mb, Date.now(), row.id)
  return mb
}
