/**
 * Client de l'API Modrinth.
 *
 * Contrairement à CurseForge, aucune clé ni demande d'accès : l'API est
 * publique. Modrinth demande en revanche un User-Agent identifiant, et c'est
 * la moindre des politesses envers un service gratuit.
 */

const BASE = 'https://api.modrinth.com/v2'
const UA = 'Cairn/1.0 (panneau self-hosted de serveurs de jeu)'

export interface ModpackSummary {
  projectId: string
  slug: string
  title: string
  description: string
  downloads: number
  iconUrl: string | null
  /** Chargeurs de mods détectés dans les catégories (fabric, forge, quilt…). */
  loaders: string[]
  gameVersions: string[]
}

export interface ModpackVersion {
  id: string
  name: string
  versionNumber: string
  gameVersions: string[]
  loaders: string[]
  /** release | beta | alpha */
  channel: string
  datePublished: string
}

/** Les chargeurs que l'image itzg sait installer pour un modpack Modrinth. */
const KNOWN_LOADERS = ['fabric', 'forge', 'neoforge', 'quilt']

async function call<T>(path: string, params: Record<string, string> = {}): Promise<T> {
  const url = new URL(BASE + path)
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)

  const res = await fetch(url, {
    headers: { 'User-Agent': UA, Accept: 'application/json' },
    signal: AbortSignal.timeout(15_000),
  })

  if (!res.ok) {
    throw createError({
      statusCode: 502,
      statusMessage: `Modrinth a répondu ${res.status}.`,
    })
  }
  return (await res.json()) as T
}

export async function searchModpacks(opts: {
  query?: string
  gameVersion?: string
  page?: number
}): Promise<{ modpacks: ModpackSummary[]; total: number }> {
  /**
   * Le filtre sur `server_side` n'est pas un confort, c'est une correction.
   *
   * Une grande partie des modpacks Modrinth les plus téléchargés sont
   * client-only (le premier au classement l'est) : les proposer reviendrait à
   * laisser installer un pack qui ne peut pas faire tourner un serveur.
   * Les tableaux imbriqués sont un OU, les tableaux successifs un ET.
   */
  const facets: string[][] = [
    ['project_type:modpack'],
    ['server_side:required', 'server_side:optional'],
  ]
  if (opts.gameVersion) facets.push([`versions:${opts.gameVersion}`])

  const data = await call<{ hits: any[]; total_hits: number }>('/search', {
    facets: JSON.stringify(facets),
    limit: '20',
    offset: String((opts.page ?? 0) * 20),
    // Sans terme de recherche, le classement par téléchargements est le plus
    // parlant ; avec, la pertinence prime.
    index: opts.query ? 'relevance' : 'downloads',
    ...(opts.query ? { query: opts.query } : {}),
  })

  return {
    total: data.total_hits,
    modpacks: data.hits.map((h) => ({
      projectId: h.project_id,
      slug: h.slug,
      title: h.title,
      description: h.description ?? '',
      downloads: h.downloads ?? 0,
      iconUrl: h.icon_url || null,
      loaders: (h.categories ?? []).filter((c: string) => KNOWN_LOADERS.includes(c)),
      // `versions` d'un résultat de recherche liste les versions du jeu.
      gameVersions: (h.versions ?? []).slice(-6).reverse(),
    })),
  }
}

export async function modpackVersions(idOrSlug: string): Promise<ModpackVersion[]> {
  const data = await call<any[]>(`/project/${encodeURIComponent(idOrSlug)}/version`)

  return data.map((v) => ({
    id: v.id,
    name: v.name,
    versionNumber: v.version_number,
    gameVersions: v.game_versions ?? [],
    loaders: v.loaders ?? [],
    channel: v.version_type ?? 'release',
    datePublished: v.date_published,
  }))
}

export interface ModSummary {
  projectId: string
  slug: string
  title: string
  description: string
  downloads: number
  iconUrl: string | null
}

/**
 * Recherche de mods installables côté serveur.
 *
 * Le filtre `server_side` écarte les mods purement visuels : les proposer
 * conduirait à en installer qui, au mieux, ne servent à rien.
 */
export async function searchMods(opts: {
  query: string
  loader?: string
  gameVersion?: string
}): Promise<{ mods: ModSummary[]; total: number }> {
  const facets: string[][] = [
    ['project_type:mod'],
    ['server_side:required', 'server_side:optional'],
  ]
  if (opts.loader) facets.push([`categories:${opts.loader}`])
  if (opts.gameVersion) facets.push([`versions:${opts.gameVersion}`])

  return searchByFacets(facets, opts.query)
}

/**
 * Recherche à facettes libres.
 *
 * Les plugins Paper et les mods Fabric ne se filtrent pas de la même façon ;
 * plutôt que d'empiler les cas ici, l'appelant compose ses facettes et cette
 * fonction ne s'occupe que de l'appel et de la mise en forme.
 */
export async function searchByFacets(
  facets: string[][],
  query: string,
): Promise<{ mods: ModSummary[]; total: number }> {
  const opts = { query }
  const data = await call<{ hits: any[]; total_hits: number }>('/search', {
    facets: JSON.stringify(facets),
    limit: '20',
    index: opts.query ? 'relevance' : 'downloads',
    ...(opts.query ? { query: opts.query } : {}),
  })

  return {
    total: data.total_hits,
    mods: data.hits.map((h) => ({
      projectId: h.project_id,
      slug: h.slug,
      title: h.title,
      description: h.description ?? '',
      downloads: h.downloads ?? 0,
      iconUrl: h.icon_url || null,
    })),
  }
}

/**
 * Identifie des fichiers déjà présents par leur empreinte.
 *
 * Deviner le projet d'après le nom de fichier ne marche pas : « ferrite-core »
 * s'écrit « ferritecore-7.0.2-neoforge.jar », et un préfixe commun ferait
 * passer « create-deco » pour « create ». L'empreinte, elle, ne se trompe pas.
 */
export async function projectsByHash(
  hashes: string[],
): Promise<Record<string, string>> {
  if (!hashes.length) return {}

  const out: Record<string, string> = {}
  // L'API accepte des lots généreux, mais pas illimités.
  for (let i = 0; i < hashes.length; i += 200) {
    const batch = hashes.slice(i, i + 200)
    const res = await fetch('https://api.modrinth.com/v2/version_files', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'User-Agent': UA },
      body: JSON.stringify({ hashes: batch, algorithm: 'sha1' }),
      signal: AbortSignal.timeout(20_000),
    })
    // Un échec ici dégrade l'affichage, il ne doit pas casser la page.
    if (!res.ok) continue
    const data = (await res.json()) as Record<string, any>
    for (const [hash, v] of Object.entries(data)) {
      if (v?.project_id) out[hash] = v.project_id
    }
  }
  return out
}

/** Fichier téléchargeable d'un mod, pour un chargeur et une version donnés. */
export async function modFile(
  idOrSlug: string,
  loader: string | string[],
  gameVersion: string,
): Promise<{ filename: string; url: string; versionNumber: string } | null> {
  // Un plugin Paper est souvent publié pour « bukkit » ou « spigot » seulement :
  // n'interroger que « paper » le déclarerait indisponible à tort.
  const loaders = Array.isArray(loader) ? loader : [loader]

  const versions = await call<any[]>(
    `/project/${encodeURIComponent(idOrSlug)}/version`,
    {
      loaders: JSON.stringify(loaders),
      game_versions: JSON.stringify([gameVersion]),
    },
  )
  const v = versions[0]
  const file = v?.files?.find((f: any) => f.primary) ?? v?.files?.[0]
  if (!file) return null
  return { filename: file.filename, url: file.url, versionNumber: v.version_number }
}
