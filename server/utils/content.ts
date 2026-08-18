import { createHash } from 'node:crypto'
import { createReadStream, createWriteStream } from 'node:fs'
import { mkdir, readFile, readdir, rename, stat, unlink } from 'node:fs/promises'
import { unzipSync } from 'fflate'
import { basename, join, resolve } from 'node:path'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import type { ServerRow } from './servers'

/**
 * CATALOGUES DE CONTENU
 *
 * Ajouter un mod ou un plugin depuis le panneau, en ne proposant que ce qui est
 * réellement compatible : la version du jeu et le chargeur viennent du serveur,
 * jamais d'un choix de l'utilisateur. C'est toute la différence entre une liste
 * utile et une liste où les trois quarts des entrées ne se chargeront pas.
 *
 * Chaque jeu a son catalogue, ou n'en a pas — et dans ce dernier cas on dit où
 * les extensions passent réellement, plutôt que d'afficher une recherche vide.
 */

export interface ContentItem {
  /** Identifiant utilisé pour installer (slug lisible). */
  id: string
  /** Identifiant stable Modrinth, seul moyen fiable de reconnaître un fichier. */
  projectId?: string
  title: string
  description: string
  downloads: number
  iconUrl: string | null
  author?: string | null
}

export interface ContentCatalog {
  /** Ce qu'on installe ici, tel qu'on l'écrit à l'utilisateur : « mods », « plugins ». */
  kind: string
  /** Ce sur quoi la compatibilité est filtrée. Affiché, pour que le filtre soit visible. */
  filter: string
  items: ContentItem[]
  total: number
}

/* -- Ce que chaque serveur sait charger ----------------------------------- */

const MC_LOADERS = ['fabric', 'forge', 'neoforge', 'quilt']
/** Un plugin publié pour l'un de ces trois se charge dans Paper. */
const PAPER_LOADERS = ['paper', 'spigot', 'bukkit']

export interface ContentTarget {
  /** Type Modrinth ou source du catalogue. */
  kind: 'mod' | 'plugin'
  /** Sous-dossier du serveur qui reçoit les fichiers. */
  dir: string
  /** Chargeurs à interroger côté catalogue. */
  loaders: string[]
  /** Libellé du filtre, montré tel quel. */
  label: string
}

/**
 * Ce qu'un serveur accepte, déduit de sa nature.
 *
 * Paper charge des plugins et ignore les mods ; Fabric et Forge font l'inverse.
 * Proposer les deux garantirait des installations sans effet.
 */
export function contentTarget(row: ServerRow): ContentTarget | null {
  if (row.game === 'factorio') {
    return { kind: 'mod', dir: 'mods', loaders: [], label: `Factorio ${row.mc_version}` }
  }
  if (row.game !== 'minecraft') return null

  const loader = (row.loader ?? row.type).toLowerCase()

  if (MC_LOADERS.includes(loader)) {
    return {
      kind: 'mod',
      dir: 'mods',
      loaders: [loader],
      label: `${loader} · Minecraft ${row.mc_version}`,
    }
  }
  if (loader === 'paper' || row.type === 'PAPER') {
    return {
      kind: 'plugin',
      dir: 'plugins',
      loaders: PAPER_LOADERS,
      label: `Paper · Minecraft ${row.mc_version}`,
    }
  }
  return null
}

/** Pourquoi ce serveur n'a pas de catalogue, dit franchement. */
export function whyNoCatalog(row: ServerRow): string {
  if (row.game === 'minecraft') {
    return "Un serveur vanilla ne charge ni mods ni plugins. Passe-le en Paper pour des plugins, ou en Fabric / Forge pour des mods."
  }
  return (
    CONTENT_NOTES[row.game] ??
    "Ce jeu n'a pas de catalogue d'extensions intégré au panneau."
  )
}

export const CONTENT_NOTES: Record<string, string> = {
  valheim:
    "Les mods Valheim passent par Thunderstore et exigent BepInEx installé côté serveur comme côté joueurs. Dépose-les via l'onglet Fichiers.",
  palworld:
    "Palworld n'a pas de système de mods pour serveur dédié : les modifications existantes sont côté client.",
  sevendays:
    "Les mods 7 Days to Die se déposent dans le dossier Mods et doivent être installés par chaque joueur. Passe par l'onglet Fichiers.",
  linuxgsm:
    "Selon le jeu, les extensions passent par le Steam Workshop. Pour Garry's Mod, renseigne l'identifiant de collection dans la Configuration : le serveur la télécharge seul au démarrage.",
}

/* -- Recherche ------------------------------------------------------------- */

/**
 * Index local du portail Factorio.
 *
 * Le portail ne sait pas chercher : il ignore `q` et renvoie toujours le
 * catalogue entier dans le même ordre. La seule façon d'offrir une vraie
 * recherche est donc de rapatrier la liste et de la parcourir ici.
 *
 * Elle pèse 13,5 Mo brute ; on ne garde que les six champs affichés, ce qui la
 * ramène à quelques mégaoctets — un panneau qui tient en 85 Mo ne peut pas se
 * permettre de conserver le reste.
 */
interface FactorioEntry {
  name: string
  title: string
  summary: string
  downloads: number
  owner: string
  version: string
}

let factorioIndex: { at: number; entries: FactorioEntry[] } | null = null
const FACTORIO_TTL = 6 * 60 * 60 * 1000

async function factorioEntries(): Promise<FactorioEntry[]> {
  if (factorioIndex && Date.now() - factorioIndex.at < FACTORIO_TTL) {
    return factorioIndex.entries
  }

  const res = await fetch('https://mods.factorio.com/api/mods?page_size=max', {
    signal: AbortSignal.timeout(60_000),
  })
  if (!res.ok) {
    if (factorioIndex) return factorioIndex.entries // Périmé vaut mieux que rien.
    throw createError({
      statusCode: 502,
      statusMessage: `Le portail Factorio a répondu ${res.status}.`,
    })
  }

  const data = (await res.json()) as any
  const entries: FactorioEntry[] = (data.results ?? []).map((m: any) => ({
    name: m.name,
    title: m.title ?? m.name,
    summary: m.summary ?? '',
    downloads: m.downloads_count ?? 0,
    owner: m.owner ?? '',
    version: m.latest_release?.info_json?.factorio_version ?? '',
  }))

  factorioIndex = { at: Date.now(), entries }
  return entries
}

async function factorioSearch(row: ServerRow, query: string): Promise<ContentCatalog> {
  // Le portail raisonne en version majeure : « 2.0 », jamais « 2.0.28 ».
  const major = (row.mc_version.match(/^(\d+\.\d+)/) ?? [])[1] ?? ''

  const all = await factorioEntries()
  const compatible = major ? all.filter((m) => m.version === major) : all

  const q = query.trim().toLowerCase()
  const matched = q
    ? compatible.filter(
        (m) =>
          m.title.toLowerCase().includes(q) ||
          m.name.toLowerCase().includes(q) ||
          m.summary.toLowerCase().includes(q),
      )
    : compatible

  // Le portail ne trie pas : sans cela la première page est un mur de mods à
  // onze téléchargements, et le catalogue paraît vide de tout ce qui compte.
  const sorted = [...matched].sort((a, b) => b.downloads - a.downloads)

  return {
    kind: 'mods',
    // On affiche la version réellement filtrée, pas celle du serveur : sinon le
    // libellé promet une précision que le filtre n'a pas.
    filter: major ? `Factorio ${major}` : 'Factorio',
    total: sorted.length,
    items: sorted.slice(0, 30).map((m) => ({
      id: m.name,
      title: m.title,
      description: m.summary,
      downloads: m.downloads,
      iconUrl: null,
      author: m.owner || null,
    })),
  }
}

export async function searchContent(
  row: ServerRow,
  query: string,
): Promise<ContentCatalog> {
  const target = contentTarget(row)
  if (!target) throw createError({ statusCode: 400, statusMessage: whyNoCatalog(row) })

  if (row.game === 'factorio') return factorioSearch(row, query)

  const facets: string[][] = [
    [`project_type:${target.kind}`],
    ['server_side:required', 'server_side:optional'],
    [`versions:${row.mc_version}`],
    target.loaders.map((l) => `categories:${l}`),
  ]

  const res = await searchByFacets(facets, query)
  return {
    kind: target.kind === 'mod' ? 'mods' : 'plugins',
    filter: target.label,
    total: res.total,
    items: res.mods.map((m) => ({
      id: m.slug || m.projectId,
      projectId: m.projectId,
      title: m.title,
      description: m.description,
      downloads: m.downloads,
      iconUrl: m.iconUrl,
    })),
  }
}

/* -- Identité déclarée par le fichier lui-même ----------------------------- */

/**
 * Identifiant du mod tel qu'il est inscrit dans le jar.
 *
 * Deux jars portant le même identifiant font planter Forge au démarrage
 * (« Duplicate mod »). Or un même mod distribué par CurseForge et par Modrinth
 * donne deux fichiers différents, d'empreintes différentes : le rapprochement
 * par empreinte ne peut donc pas repérer ce doublon-là. L'identifiant inscrit
 * dans le fichier, lui, est le même des deux côtés.
 */
const modIdCache = new Map<string, { size: number; mtime: number; id: string | null }>()

async function modIdOfJar(path: string, size: number, mtime: number) {
  const cached = modIdCache.get(path)
  if (cached && cached.size === size && cached.mtime === mtime) return cached.id

  let id: string | null = null
  try {
    const raw = await readFile(path)
    // On ne décompresse que les fichiers de métadonnées : un jar de modpack
    // pèse parfois cent mégaoctets, et tout extraire serait absurde.
    const wanted = [
      'fabric.mod.json',
      'quilt.mod.json',
      'META-INF/neoforge.mods.toml',
      'META-INF/mods.toml',
    ]
    const entries = unzipSync(new Uint8Array(raw), {
      filter: (f) => wanted.includes(f.name),
    })

    const text = (name: string) =>
      entries[name] ? Buffer.from(entries[name]!).toString('utf8') : null

    const fabric = text('fabric.mod.json') ?? text('quilt.mod.json')
    if (fabric) {
      id = JSON.parse(fabric)?.id ?? JSON.parse(fabric)?.quilt_loader?.id ?? null
    } else {
      const toml = text('META-INF/neoforge.mods.toml') ?? text('META-INF/mods.toml')
      id = toml?.match(/^\s*modId\s*=\s*["']([^"']+)["']/m)?.[1] ?? null
    }
  } catch {
    id = null // Archive illisible ou format inattendu : on ne bloque pas pour ça.
  }

  modIdCache.set(path, { size, mtime, id })
  return id
}

/** Identifiants déjà présents dans le dossier, par nom de fichier. */
async function declaredModIds(dir: string): Promise<Map<string, string>> {
  const out = new Map<string, string>()
  const names = await readdir(dir).catch(() => [] as string[])

  for (const name of names) {
    if (!/\.jar$/i.test(name)) continue
    const path = join(dir, name)
    const s = await stat(path).catch(() => null)
    if (!s?.isFile()) continue
    const id = await modIdOfJar(path, s.size, s.mtimeMs)
    if (id) out.set(id, name)
  }
  return out
}

/* -- Installation ---------------------------------------------------------- */

async function download(url: string, dest: string) {
  const res = await fetch(url, { signal: AbortSignal.timeout(180_000) })
  if (!res.ok || !res.body) {
    throw createError({
      statusCode: 502,
      statusMessage: `Téléchargement impossible (${res.status}).`,
    })
  }
  await pipeline(Readable.fromWeb(res.body as any), createWriteStream(dest))
}

async function installFactorio(row: ServerRow, name: string, dir: string) {
  // Le portail exige un compte Factorio pour servir les fichiers : c'est une
  // contrainte de leur côté, pas un choix du panneau.
  const user = getSetting('factorio_username')?.trim()
  const token = getSetting('factorio_token')?.trim()
  if (!user || !token) {
    throw createError({
      statusCode: 400,
      statusMessage:
        "Le portail Factorio ne laisse télécharger qu'avec un compte. Renseigne ton identifiant et ton jeton dans les Réglages — ils se trouvent sur factorio.com, page de ton profil.",
    })
  }

  const info = (await $fetch(
    `https://mods.factorio.com/api/mods/${encodeURIComponent(name)}/full`,
  ).catch(() => null)) as any

  const releases: any[] = info?.releases ?? []
  const major = (row.mc_version.match(/^(\d+\.\d+)/) ?? [])[1] ?? ''
  const usable = releases.filter(
    (r) => !major || r.info_json?.factorio_version === major,
  )
  const release = usable[usable.length - 1] ?? releases[releases.length - 1]

  if (!release) {
    throw createError({
      statusCode: 409,
      statusMessage: `Ce mod ne publie aucune version pour Factorio ${major}.`,
    })
  }

  const url = new URL(`https://mods.factorio.com${release.download_url}`)
  url.searchParams.set('username', user)
  url.searchParams.set('token', token)

  const filename = release.file_name ?? `${name}_${release.version}.zip`
  await download(url.toString(), join(dir, filename))
  return { filename, version: release.version as string }
}

/**
 * Installe une extension dans un serveur existant.
 *
 * Le fichier est posé à côté des autres, sans redémarrage : c'est à l'appelant
 * de décider quand relancer, parce que couper un serveur peuplé pour ajouter un
 * plugin n'est pas une décision que le panneau doit prendre seul.
 */
export async function installContent(row: ServerRow, projectId: string) {
  const target = contentTarget(row)
  if (!target) throw createError({ statusCode: 400, statusMessage: whyNoCatalog(row) })

  const dir = join(resolve(row.data_dir), target.dir)
  await mkdir(dir, { recursive: true })

  if (row.game === 'factorio') return installFactorio(row, projectId, dir)

  const file = await modFile(projectId, target.loaders, row.mc_version)
  if (!file) {
    throw createError({
      statusCode: 409,
      statusMessage: `Aucune version publiée pour ${target.label}.`,
    })
  }

  // Les identifiants déjà en place sont relevés avant, pour pouvoir comparer.
  const existing = target.kind === 'mod' ? await declaredModIds(dir) : new Map()

  const dest = join(dir, file.filename)
  await download(file.url, dest)

  if (target.kind === 'mod') {
    const s = await stat(dest).catch(() => null)
    const newId = s ? await modIdOfJar(dest, s.size, s.mtimeMs) : null
    const clash = newId ? existing.get(newId) : undefined

    // Deux jars déclarant le même mod empêchent le serveur de démarrer. On
    // retire donc ce qu'on vient de poser plutôt que de laisser une panne.
    if (clash && clash !== file.filename) {
      await unlink(dest).catch(() => {})
      modIdCache.delete(dest)
      throw createError({
        statusCode: 409,
        statusMessage: `Ce mod est déjà installé, sous le nom « ${clash} ». En garder deux copies empêcherait le serveur de démarrer.`,
      })
    }
  }

  return { filename: file.filename, version: file.versionNumber }
}

/* -- Inventaire ------------------------------------------------------------ */

export interface InstalledFile {
  filename: string
  sizeMb: number
  /** Un fichier désactivé reste sur le disque mais n'est plus chargé. */
  disabled: boolean
  /** Projet Modrinth correspondant, quand le fichier a pu être identifié. */
  projectId?: string
}

/**
 * Empreintes déjà calculées, indexées par chemin.
 *
 * Un modpack pèse plusieurs centaines de mégaoctets ; les relire à chaque
 * affichage de la page serait absurde. Taille et date de modification suffisent
 * à savoir qu'un fichier n'a pas bougé.
 */
const hashCache = new Map<string, { size: number; mtime: number; sha1: string }>()

async function sha1OfFile(path: string, size: number, mtime: number): Promise<string> {
  const cached = hashCache.get(path)
  if (cached && cached.size === size && cached.mtime === mtime) return cached.sha1

  const h = createHash('sha1')
  await pipeline(createReadStream(path), h)
  const sha1 = h.digest('hex')
  hashCache.set(path, { size, mtime, sha1 })
  return sha1
}

/**
 * Ce qui est réellement en place.
 *
 * Lu depuis le disque et non depuis une table : le dossier peut avoir été
 * modifié par l'onglet Fichiers, par un modpack ou à la main. Le disque est la
 * seule source qui ne peut pas mentir.
 */
export async function installedContent(row: ServerRow): Promise<InstalledFile[]> {
  const target = contentTarget(row)
  if (!target) return []

  const dir = join(resolve(row.data_dir), target.dir)
  let names: string[]
  try {
    names = await readdir(dir)
  } catch {
    return [] // Dossier absent : le serveur n'a simplement rien reçu encore.
  }

  const out: InstalledFile[] = []
  const byHash = new Map<string, InstalledFile>()

  for (const name of names) {
    if (!/\.(jar|zip)(\.disabled)?$/i.test(name)) continue
    const path = join(dir, name)
    const s = await stat(path).catch(() => null)
    if (!s?.isFile()) continue

    const file: InstalledFile = {
      filename: name,
      sizeMb: Math.round((s.size / 1024 / 1024) * 10) / 10,
      disabled: name.endsWith('.disabled'),
    }
    out.push(file)

    // Factorio n'a pas d'index d'empreintes public : on s'en tient au nom.
    if (row.game === 'minecraft') {
      const sha1 = await sha1OfFile(path, s.size, s.mtimeMs).catch(() => null)
      if (sha1) byHash.set(sha1, file)
    }
  }

  if (byHash.size) {
    // Une identification qui échoue laisse simplement les projets inconnus :
    // la liste des fichiers reste juste, seul le repérage « déjà installé »
    // devient moins précis.
    const found = await projectsByHash([...byHash.keys()]).catch(() => ({}))
    for (const [hash, projectId] of Object.entries(found)) {
      const f = byHash.get(hash)
      if (f) f.projectId = projectId
    }
  }

  return out.sort((a, b) => a.filename.localeCompare(b.filename, 'fr'))
}

/**
 * Désactive un mod sans le supprimer.
 *
 * Le suffixe `.disabled` est la convention que Forge, NeoForge et Fabric
 * respectent tous : le fichier reste sur le disque, le chargeur l'ignore. Pour
 * chercher le coupable d'un plantage, c'est le geste réversible dont on a
 * besoin — supprimer obligerait à retélécharger pour tester l'hypothèse
 * inverse.
 */
export async function setContentDisabled(
  row: ServerRow,
  filename: string,
  disabled: boolean,
): Promise<{ filename: string; disabled: boolean }> {
  const target = contentTarget(row)
  if (!target) throw createError({ statusCode: 400, statusMessage: whyNoCatalog(row) })

  const safe = basename(filename)
  if (!safe || safe.startsWith('.')) {
    throw createError({ statusCode: 400, statusMessage: 'Nom de fichier invalide.' })
  }

  const dir = join(resolve(row.data_dir), target.dir)
  const bare = safe.replace(/\.disabled$/i, '')
  const next = disabled ? `${bare}.disabled` : bare

  if (next === safe) return { filename: safe, disabled }

  try {
    await rename(join(dir, safe), join(dir, next))
  } catch (e: any) {
    if (e?.code === 'ENOENT') {
      throw createError({ statusCode: 404, statusMessage: `${safe} n'existe pas.` })
    }
    throw createError({
      statusCode: 500,
      statusMessage: `${safe} n'a pas pu être ${disabled ? 'désactivé' : 'réactivé'}.`,
    })
  }

  return { filename: next, disabled }
}

export async function removeContent(row: ServerRow, filename: string) {
  const target = contentTarget(row)
  if (!target) throw createError({ statusCode: 400, statusMessage: whyNoCatalog(row) })

  // Le nom vient du client : n'en garder que le dernier segment interdit de
  // remonter hors du dossier avec « ../ ».
  const safe = basename(filename)
  if (!safe || safe.startsWith('.')) {
    throw createError({ statusCode: 400, statusMessage: 'Nom de fichier invalide.' })
  }

  try {
    await unlink(join(resolve(row.data_dir), target.dir, safe))
  } catch (e: any) {
    // Un fichier déjà absent n'est pas une panne du panneau : le dire
    // proprement plutôt que de renvoyer une trace d'exécution.
    if (e?.code === 'ENOENT') {
      throw createError({ statusCode: 404, statusMessage: `${safe} n'existe pas.` })
    }
    throw createError({
      statusCode: 500,
      statusMessage: `Suppression de ${safe} impossible.`,
    })
  }
  return { ok: true, filename: safe }
}
