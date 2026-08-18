import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

/** Lit un des fichiers de listes de Minecraft. Absent = liste vide. */
async function readJsonList(dataDir: string, file: string): Promise<any[]> {
  try {
    const raw = await readFile(join(dataDir, file), 'utf8')
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export default defineEventHandler(async (event) => {
  const row = requireServerRow(getRouterParam(event, 'id')!)

  // Les joueurs connectés viennent de RCON, les listes des fichiers du serveur :
  // ces derniers restent lisibles même quand le serveur est arrêté.
  const rcon = await serverRcon(row)
  const online = rcon ? await rcon.players() : null

  let names: string[] = []
  if (rcon && online && online.online > 0) {
    try {
      const res = await rcon.command('list')
      names = (res.split(':')[1] ?? '')
        .split(',')
        .map((n) => n.trim())
        .filter(Boolean)
    } catch {
      names = []
    }
  }

  const [ops, whitelist, banned] = await Promise.all([
    readJsonList(row.data_dir, 'ops.json'),
    readJsonList(row.data_dir, 'whitelist.json'),
    readJsonList(row.data_dir, 'banned-players.json'),
  ])

  return {
    running: Boolean(rcon),
    online: { count: online?.online ?? 0, max: online?.max ?? null, names },
    ops: ops.map((o) => ({ name: o.name, level: o.level ?? 4 })),
    whitelist: whitelist.map((w) => ({ name: w.name })),
    banned: banned.map((b) => ({ name: b.name, reason: b.reason ?? null })),
  }
})
