import { readdir, readFile, stat } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import type { ServerType } from '#shared/types'

/**
 * Adoption d'un serveur Minecraft déjà présent sur la machine.
 *
 * Le panneau ne doit pas se limiter aux serveurs qu'il a créés : un dossier de
 * serveur porte déjà tout ce qu'il faut pour être repris — sa configuration,
 * son monde, ses mods. On lit ce qui est là plutôt que de demander à
 * l'utilisateur de ressaisir ce que la machine sait déjà.
 */

export interface Detection {
  path: string
  name: string
  type: ServerType
  mcVersion: string
  hostPort: number
  maxPlayers: number | null
  motd: string | null
  loader: string | null
  loaderVersion: string | null
  hasWorld: boolean
  modCount: number
  /** Ce qui empêche l'import, s'il y a lieu. */
  problem: string | null
}

/** Lit server.properties en simple clé=valeur. */
async function readProps(dir: string): Promise<Record<string, string>> {
  try {
    const raw = await readFile(join(dir, 'server.properties'), 'utf8')
    const out: Record<string, string> = {}
    for (const line of raw.split(/\r?\n/)) {
      if (!line.trim() || line.startsWith('#')) continue
      const eq = line.indexOf('=')
      if (eq === -1) continue
      out[line.slice(0, eq).trim()] = line.slice(eq + 1).trim()
    }
    return out
  } catch {
    return {}
  }
}

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path)
    return true
  } catch {
    return false
  }
}

/**
 * Devine le type de serveur d'après ce que le dossier contient.
 *
 * L'ordre compte : un serveur Forge a aussi un dossier `mods`, donc les
 * marqueurs propres à chaque plateforme passent avant le test générique.
 */
async function detectType(
  dir: string,
  files: string[],
): Promise<{ type: ServerType; loader: string | null; loaderVersion: string | null }> {
  const lower = files.map((f) => f.toLowerCase())
  const has = (re: RegExp) => lower.some((f) => re.test(f))

  if ((await exists(join(dir, 'libraries/net/neoforged'))) || has(/^neoforge/)) {
    return { type: 'FORGE', loader: 'neoforge', loaderVersion: null }
  }
  if ((await exists(join(dir, 'libraries/net/minecraftforge'))) || has(/^forge-.*\.jar$/)) {
    return { type: 'FORGE', loader: 'forge', loaderVersion: null }
  }
  if (has(/fabric-server|^\.fabric$/) || (await exists(join(dir, '.fabric')))) {
    return { type: 'FABRIC', loader: 'fabric', loaderVersion: null }
  }
  if (has(/^paper.*\.jar$/) || (await exists(join(dir, 'plugins')))) {
    return { type: 'PAPER', loader: null, loaderVersion: null }
  }
  return { type: 'VANILLA', loader: null, loaderVersion: null }
}

/** Cherche la version de Minecraft là où les serveurs la laissent traîner. */
async function detectVersion(dir: string, files: string[]): Promise<string> {
  // itzg et Mojang laissent un version.json dans le dossier.
  for (const candidate of ['version.json', '.minemanager-version']) {
    try {
      const raw = await readFile(join(dir, candidate), 'utf8')
      const v = JSON.parse(raw)
      const found = v.name ?? v.id ?? v.version
      if (typeof found === 'string' && /^\d/.test(found)) return found
    } catch {
      // continue
    }
  }

  // Sinon le nom du jar porte souvent la version : paper-1.21.1-133.jar
  for (const f of files) {
    const m = f.match(/(\d+\.\d+(?:\.\d+)?)/)
    if (f.endsWith('.jar') && m) return m[1]!
  }
  return 'LATEST'
}

export async function detectServer(path: string): Promise<Detection> {
  const dir = resolve(path)

  let files: string[] = []
  let problem: string | null = null
  try {
    files = await readdir(dir)
  } catch {
    problem = "Ce dossier n'existe pas ou n'est pas lisible."
  }

  const props = await readProps(dir)
  const { type, loader, loaderVersion } = await detectType(dir, files)

  const worldName = props['level-name'] || 'world'
  const hasWorld = await exists(join(dir, worldName))

  let modCount = 0
  try {
    modCount = (await readdir(join(dir, 'mods'))).filter((f) => f.endsWith('.jar')).length
  } catch {
    modCount = 0
  }

  // Un dossier sans server.properties ni jar n'est très probablement pas un
  // serveur : mieux vaut le dire que de créer un conteneur qui échouera.
  if (!problem && !files.includes('server.properties') && !files.some((f) => f.endsWith('.jar'))) {
    problem = "Ce dossier ne ressemble pas à un serveur Minecraft."
  }

  return {
    path: dir,
    name: dir.split('/').filter(Boolean).pop() ?? 'serveur',
    type,
    mcVersion: await detectVersion(dir, files),
    hostPort: Number(props['server-port']) || 25565,
    maxPlayers: Number(props['max-players']) || null,
    motd: props['motd'] ?? null,
    loader,
    loaderVersion,
    hasWorld,
    modCount,
    problem,
  }
}

/** Passe en revue les sous-dossiers d'un chemin pour proposer des candidats. */
export async function scanForServers(parent: string): Promise<Detection[]> {
  const dir = resolve(parent)

  let entries
  try {
    entries = await readdir(dir, { withFileTypes: true })
  } catch {
    throw createError({
      statusCode: 400,
      statusMessage: "Ce dossier n'existe pas ou n'est pas lisible.",
    })
  }

  const candidates = await Promise.all(
    entries
      .filter((e) => e.isDirectory() && !e.name.startsWith('.'))
      .slice(0, 60)
      .map((e) => detectServer(join(dir, e.name))),
  )

  // On ne propose que ce qui ressemble vraiment à un serveur.
  return candidates.filter((c) => c.problem === null)
}
