/**
 * Catalogue LinuxGSM.
 *
 * La liste vit chez LinuxGSM et évolue avec le projet : on la lit à la source
 * plutôt que d'en figer une copie qui vieillirait en silence. Elle est mise en
 * cache car elle ne change que de loin en loin.
 */
const SOURCE =
  'https://raw.githubusercontent.com/GameServerManagers/LinuxGSM/master/lgsm/data/serverlist.csv'

const TTL_MS = 12 * 60 * 60 * 1000
interface LgsmGame {
  shortname: string
  /** Nom du service LinuxGSM (gmodserver) : sert à trouver sa configuration. */
  gameservername: string
  name: string
}
let cache: { at: number; games: LgsmGame[] } | null = null

export default defineEventHandler(async () => {
  if (cache && Date.now() - cache.at < TTL_MS) return { games: cache.games }

  let text: string
  try {
    const res = await fetch(SOURCE, { signal: AbortSignal.timeout(15_000) })
    if (!res.ok) throw new Error(String(res.status))
    text = await res.text()
  } catch {
    // Sans réseau, on ne bloque pas la création : le nom court reste saisissable.
    return { games: cache?.games ?? [] }
  }

  const games = text
    .split(/\r?\n/)
    .slice(1)
    .map((line) => line.split(','))
    .filter((c) => c.length >= 3 && c[0] && c[1] && c[2])
    .map((c) => ({
      shortname: c[0]!.trim(),
      gameservername: c[1]!.trim(),
      name: c[2]!.trim(),
    }))
    .sort((a, b) => a.name.localeCompare(b.name, 'fr'))

  cache = { at: Date.now(), games }
  return { games }
})
