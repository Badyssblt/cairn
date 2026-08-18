import { readdir, stat } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import type { ServerRow } from './servers'

/**
 * LES MONDES COMME OBJETS À PART ENTIÈRE
 *
 * Le gestionnaire de fichiers sait déjà télécharger un dossier, mais il ne sait
 * pas *lequel* est un monde : il montre trente dossiers d'égale importance,
 * dont un seul contient une partie. Ce fichier fait la distinction, à partir de
 * la seule marque fiable — un monde est un dossier qui contient `level.dat`.
 *
 * La difficulté vient de ce que les deux familles de serveurs ne rangent pas
 * leurs dimensions pareil. Vanilla, Forge et Fabric mettent le Nether et l'End
 * *dans* le dossier du monde (`world/DIM-1`). Paper et ses dérivés en font des
 * dossiers frères (`world_nether`, `world_the_end`), qui ont chacun leur
 * `level.dat` et passeraient donc pour des mondes indépendants. Les rattacher
 * évite d'afficher trois mondes là où le joueur n'en voit qu'un — et surtout
 * évite d'en sauvegarder un sans les deux autres.
 */

export interface WorldInfo {
  /** Nom du dossier. */
  name: string
  /** Monde effectivement chargé, d'après `level-name`. */
  active: boolean
  sizeMb: number
  /** Dossiers de dimension rattachés, à la manière de Paper. */
  dimensions: string[]
}

/** Suffixes que Paper donne aux dimensions du monde principal. */
const DIMENSION_SUFFIXES = ['_nether', '_the_end']

/** Le monde chargé au démarrage, tel que server.properties le désigne. */
export async function levelName(row: ServerRow): Promise<string> {
  const props = await readProperties(row.data_dir)
  return props.find((p) => p.key === 'level-name')?.value.trim() || 'world'
}

async function isWorldDir(path: string): Promise<boolean> {
  const s = await stat(join(path, 'level.dat')).catch(() => null)
  return Boolean(s?.isFile())
}

export async function listWorlds(row: ServerRow): Promise<WorldInfo[]> {
  const root = resolve(row.data_dir)
  const active = await levelName(row)

  let names: string[]
  try {
    names = await readdir(root)
  } catch {
    return []
  }

  const worlds: string[] = []
  for (const name of names) {
    const path = join(root, name)
    const s = await stat(path).catch(() => null)
    if (!s?.isDirectory()) continue
    if (await isWorldDir(path)) worlds.push(name)
  }

  // Les dimensions Paper sont retirées de la liste principale et rattachées à
  // leur monde — mais seulement si ce monde existe : un dossier
  // « world_nether » orphelin reste un monde à part entière.
  const attached = new Set<string>()
  for (const name of worlds) {
    for (const suffix of DIMENSION_SUFFIXES) {
      if (name.endsWith(suffix) && worlds.includes(name.slice(0, -suffix.length))) {
        attached.add(name)
      }
    }
  }

  const out: WorldInfo[] = []
  for (const name of worlds) {
    if (attached.has(name)) continue

    const dimensions = DIMENSION_SUFFIXES.map((s) => `${name}${s}`).filter((d) =>
      attached.has(d),
    )

    let sizeMb = await directorySizeMb(join(root, name))
    for (const d of dimensions) sizeMb += await directorySizeMb(join(root, d))

    out.push({ name, active: name === active, sizeMb, dimensions })
  }

  return out.sort((a, b) => Number(b.active) - Number(a.active) || a.name.localeCompare(b.name, 'fr'))
}

/**
 * Chemins à inclure dans une archive du monde seul.
 *
 * Le monde chargé et ses dimensions, rien d'autre : ni les mods, ni la
 * configuration. C'est ce qui fait la différence de taille — et c'est aussi ce
 * qui rend la restauration sûre, puisqu'elle ne peut pas défaire une mise à
 * jour de mods faite entre-temps.
 */
export async function worldPaths(row: ServerRow): Promise<string[]> {
  const active = await levelName(row)
  const root = resolve(row.data_dir)

  const paths: string[] = []
  for (const name of [active, ...DIMENSION_SUFFIXES.map((s) => `${active}${s}`)]) {
    if (await isWorldDir(join(root, name))) paths.push(name)
  }
  return paths
}

/**
 * La graine du monde.
 *
 * Elle est enfouie dans `level.dat`, un fichier NBT compressé qu'il faudrait
 * une bibliothèque entière pour lire. Or le serveur, lui, répond `seed` en une
 * commande : on la demande quand il tourne, et on ne l'affiche pas sinon.
 * Ajouter une dépendance pour une valeur d'agrément ne le vaudrait pas.
 */
export async function worldSeed(row: ServerRow): Promise<string | null> {
  if (row.game !== 'minecraft') return null

  const rcon = await serverRcon(row).catch(() => null)
  if (!rcon) return null

  try {
    // « Seed: [-4707922695188513737] »
    const res = await rcon.command('seed')
    return res.match(/\[(-?\d+)\]/)?.[1] ?? null
  } catch {
    return null
  }
}
