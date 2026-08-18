/**
 * Client CurseForge — sans clé API.
 *
 * L'API officielle de CurseForge exige une clé soumise à approbation. On passe
 * donc par `api.modpacks.ch`, l'API de Feed The Beast, qui expose le catalogue
 * CurseForge en lecture libre : recherche, détail des packs, et surtout la
 * liste complète des fichiers avec leurs URL de téléchargement directes.
 *
 * L'installeur officiel de FTB sait en théorie installer ces packs, mais son
 * chemin CurseForge est cassé en amont : l'API renvoie `specs` sous forme de
 * chaîne vide là où le binaire attend un objet, ce qui le fait échouer (build
 * 24.622) ou paniquer (build récent). On installe donc nous-mêmes à partir de
 * la liste de fichiers — ce qui a l'avantage de nous laisser écarter les mods
 * client, qu'un serveur ne doit pas charger.
 */

const BASE = 'https://api.modpacks.ch/public'
const UA = 'Cairn/1.0 (panneau self-hosted de serveurs de jeu)'

export interface CfModpackSummary {
  id: number
  name: string
  description: string
  installs: number
  iconUrl: string | null
  tags: string[]
}

export interface CfVersion {
  id: number
  name: string
  type: string
  updated: number
}

export interface CfFile {
  name: string
  path: string
  url: string
  sha1: string | null
  size: number
  clientOnly: boolean
}

export interface CfInstallPlan {
  files: CfFile[]
  /** fabric | forge | neoforge | quilt */
  loader: string | null
  loaderVersion: string | null
  mcVersion: string | null
  totalBytes: number
}

async function call<T>(path: string): Promise<T> {
  const res = await fetch(BASE + path, {
    headers: { 'User-Agent': UA, Accept: 'application/json' },
    signal: AbortSignal.timeout(20_000),
  })
  if (!res.ok) {
    throw createError({
      statusCode: 502,
      statusMessage: `CurseForge (via FTB) a répondu ${res.status}.`,
    })
  }
  return (await res.json()) as T
}

/**
 * Ce qu'on montre quand rien n'est cherché.
 *
 * L'API n'expose pas de classement « populaire » pour CurseForge, et chercher
 * le mot « modpack » remonte surtout des packs obscurs qui ont ce mot dans leur
 * titre. On part donc de familles réellement connues et on trie par nombre de
 * joueurs : la première impression du catalogue montre ce que les gens jouent.
 */
const FEATURED_TERMS = [
  'all the mods',
  'rlcraft',
  'better mc',
  'dawncraft',
  'vault hunters',
  'create',
  'skyfactory',
  'cobblemon',
]

/** La sélection ne bouge pas d'une minute à l'autre : on évite de la refaire. */
const FEATURED_TTL_MS = 30 * 60 * 1000
let featuredCache: { at: number; packs: CfModpackSummary[] } | null = null

async function idsFor(term: string): Promise<number[]> {
  try {
    const res = await call<{ curseforge?: number[] }>(
      `/modpack/search/20?term=${encodeURIComponent(term)}`,
    )
    return res.curseforge ?? []
  } catch {
    return []
  }
}

/** Détails de plusieurs packs, en tolérant les échecs isolés. */
async function summariesFor(ids: number[]): Promise<CfModpackSummary[]> {
  const packs = await Promise.all(ids.map((id) => packSummary(id).catch(() => null)))
  return packs.filter((p): p is CfModpackSummary => p !== null)
}

export async function searchCfModpacks(query: string): Promise<CfModpackSummary[]> {
  const term = query.trim()

  if (!term) {
    if (featuredCache && Date.now() - featuredCache.at < FEATURED_TTL_MS) {
      return featuredCache.packs
    }

    const lists = await Promise.all(FEATURED_TERMS.map(idsFor))
    // Deux termes peuvent remonter le même pack : on ne le montre qu'une fois.
    const ids = [...new Set(lists.flatMap((l) => l.slice(0, 4)))]

    const packs = (await summariesFor(ids))
      .sort((a, b) => b.installs - a.installs)
      .slice(0, 16)

    featuredCache = { at: Date.now(), packs }
    return packs
  }

  // Recherche explicite : l'ordre de pertinence de l'API fait autorité, mais
  // à pertinence voisine le pack le plus joué passe devant.
  const ids = (await idsFor(term)).slice(0, 16)
  return (await summariesFor(ids)).sort((a, b) => b.installs - a.installs)
}

async function packSummary(id: number): Promise<CfModpackSummary> {
  const d = await call<any>(`/curseforge/${id}`)
  return {
    id,
    name: d.name ?? `Pack ${id}`,
    description: d.synopsis ?? d.description ?? '',
    installs: d.installs ?? 0,
    iconUrl:
      (d.art ?? []).find((a: any) => a.type === 'square')?.url ??
      (d.art ?? [])[0]?.url ??
      null,
    tags: (d.tags ?? []).map((t: any) => t.name).filter(Boolean).slice(0, 4),
  }
}

export async function cfPackVersions(id: number): Promise<CfVersion[]> {
  const d = await call<any>(`/curseforge/${id}`)
  return (d.versions ?? [])
    .map((v: any) => ({
      id: v.id,
      name: v.name,
      type: v.type ?? 'release',
      updated: (v.updated ?? 0) * 1000,
    }))
    .sort((a: CfVersion, b: CfVersion) => b.updated - a.updated)
}

/**
 * Tout ce qu'il faut pour installer : les fichiers à poser et le modloader à
 * confier à itzg. Les mods marqués `clientonly` sont écartés — les charger
 * côté serveur va du gaspillage au plantage au démarrage.
 */
export async function installPlan(
  packId: number,
  versionId: number,
): Promise<CfInstallPlan> {
  const d = await call<any>(`/curseforge/${packId}/${versionId}`)

  const files: CfFile[] = (d.files ?? [])
    .filter((f: any) => !f.clientonly && f.url)
    .map((f: any) => ({
      name: f.name,
      // Les chemins arrivent en « mods/ » ou « ./ » : on normalise.
      path: (f.path ?? './').replace(/^\.?\/*/, '').replace(/\/*$/, ''),
      url: f.url,
      sha1: f.sha1 || null,
      size: f.size ?? 0,
      clientOnly: false,
    }))

  const targets: any[] = d.targets ?? []
  const loader = targets.find((t) => t.type === 'modloader')
  const game = targets.find((t) => t.name === 'minecraft')

  return {
    files,
    loader: loader?.name ?? null,
    loaderVersion: loader?.version ?? null,
    mcVersion: game?.version ?? null,
    totalBytes: files.reduce((n, f) => n + f.size, 0),
  }
}
