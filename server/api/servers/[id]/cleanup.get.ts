import { readdir, stat } from 'node:fs/promises'
import { join, resolve } from 'node:path'

/** Dossiers qui grossissent sans qu'on y pense, et qu'on peut vider sans risque. */
const DISPOSABLE = ['logs', 'crash-reports', 'debug', '.cache']

async function sizeOf(dir: string): Promise<number> {
  let total = 0
  const walk = async (p: string) => {
    let entries
    try {
      entries = await readdir(p, { withFileTypes: true })
    } catch {
      return
    }
    for (const e of entries) {
      const full = join(p, e.name)
      if (e.isDirectory()) await walk(full)
      else {
        try {
          total += (await stat(full)).size
        } catch {
          /* disparu en route */
        }
      }
    }
  }
  await walk(dir)
  return total
}

/**
 * Ce qui occupe le disque, et ce qu'on peut récupérer.
 *
 * Les journaux et rapports de plantage s'accumulent indéfiniment : sur un
 * serveur qui redémarre en boucle, ils atteignent vite plusieurs gigaoctets.
 */
export default defineEventHandler(async (event) => {
  const row = requireServerRow(getRouterParam(event, 'id')!)
  const dir = resolve(row.data_dir)

  const entries = await readdir(dir, { withFileTypes: true }).catch(() => [])
  const folders = await Promise.all(
    entries
      .filter((e) => e.isDirectory())
      .map(async (e) => ({
        name: e.name,
        sizeBytes: await sizeOf(join(dir, e.name)),
        disposable: DISPOSABLE.includes(e.name),
      })),
  )

  folders.sort((a, b) => b.sizeBytes - a.sizeBytes)

  return {
    folders: folders.slice(0, 12),
    reclaimable: folders
      .filter((f) => f.disposable)
      .reduce((s, f) => s + f.sizeBytes, 0),
  }
})
