import { readdir, readFile, stat } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import type { ServerRow } from './servers'

/**
 * RAPPORTS DE PLANTAGE
 *
 * Le journal du conteneur ne garde que ses dernières lignes, et un plantage de
 * chargement de mods y arrive tronqué : la pile Java fait souvent plus que le
 * tampon qu'on relit. Minecraft écrit pourtant, à côté, un rapport complet et
 * *structuré* — c'est la seule source qui nomme franchement le mod fautif.
 *
 * Les trois modloaders ne le disent pas de la même façon :
 *
 *   Forge et NeoForge ouvrent une section « -- MOD <id> -- » par mod en cause,
 *   avec le fichier jar et le message d'échec. C'est le cas idéal.
 *
 *   Fabric ajoute une ligne « Suspected mods: Nom (id) version ». Moins de
 *   détail, mais l'identifiant y est.
 *
 *   Les erreurs de mixin ne passent par aucun des deux et ne laissent que le
 *   nom du fichier de configuration, « mixins.<id>.json », d'où on remonte.
 */

export interface CrashCulprit {
  /** Identifiant du mod tel que le modloader le nomme. */
  modId: string
  /** Le jar correspondant, quand le rapport le donne ou qu'on l'a retrouvé. */
  filename: string | null
  /** Le message d'échec, tel que le rapport le formule. */
  failure: string | null
  /**
   * Mod destiné au client, posé sur un serveur. C'est la méprise la plus
   * fréquente des packs assemblés à la main, et elle a une réparation
   * évidente : le retirer.
   */
  clientOnly: boolean
}

export interface CrashReport {
  filename: string
  at: number
  /** La ligne « Description: » du rapport, qui résume la nature du plantage. */
  description: string | null
  culprits: CrashCulprit[]
}

const DIR = 'crash-reports'

/** Au-delà, le rapport parle d'un incident déjà résolu. */
const MAX_AGE_MS = 24 * 60 * 60 * 1000

/**
 * Le rapport le plus récent, s'il est assez frais pour parler du plantage
 * courant. Un rapport d'il y a trois jours nommerait un mod déjà retiré.
 */
export async function latestCrashReport(row: ServerRow): Promise<CrashReport | null> {
  const dir = join(resolve(row.data_dir), DIR)

  let names: string[]
  try {
    names = (await readdir(dir)).filter((n) => n.endsWith('.txt'))
  } catch {
    return null
  }
  if (!names.length) return null

  let newest: { name: string; at: number } | null = null
  for (const name of names) {
    const s = await stat(join(dir, name)).catch(() => null)
    if (!s?.isFile()) continue
    if (!newest || s.mtimeMs > newest.at) newest = { name, at: s.mtimeMs }
  }

  if (!newest || Date.now() - newest.at > MAX_AGE_MS) return null

  const raw = await readFile(join(dir, newest.name), 'utf8').catch(() => null)
  if (!raw) return null

  return {
    filename: newest.name,
    at: Math.round(newest.at),
    description: raw.match(/^Description:\s*(.+)$/m)?.[1]?.trim() ?? null,
    culprits: await identifyCulprits(row, raw),
  }
}

/* -- Extraction ------------------------------------------------------------ */

/** Un mod qui touche une classe client sur un serveur ne peut que planter. */
function looksClientOnly(text: string): boolean {
  return (
    /net[./]minecraft[./]client[./]/.test(text) ||
    /ClientModInitializer|ClientOnly|@OnlyIn\(Dist\.CLIENT\)/.test(text) ||
    /(?:this|that) mod (?:is|was) (?:for|made for) the client/i.test(text)
  )
}

async function identifyCulprits(row: ServerRow, raw: string): Promise<CrashCulprit[]> {
  const found = new Map<string, CrashCulprit>()
  const jars = await listJars(row)

  const add = (modId: string, filename: string | null, failure: string | null, text: string) => {
    const id = modId.trim().toLowerCase()
    // « minecraft » et le chargeur lui-même apparaissent dans presque tous les
    // rapports sans jamais être la cause : les retenir noierait le vrai mod.
    if (!id || IGNORED.has(id)) return

    const existing = found.get(id)
    if (existing) {
      // Un même mod peut être nommé par deux motifs : on garde le plus riche.
      existing.filename ??= filename ?? matchJar(jars, id)
      existing.failure ??= failure
      existing.clientOnly ||= looksClientOnly(text)
      return
    }

    found.set(id, {
      modId: id,
      filename: filename ?? matchJar(jars, id),
      failure,
      clientOnly: looksClientOnly(text),
    })
  }

  /* Forge et NeoForge : une section par mod, la source la plus fiable. */
  // `$(?![\s\S])` tient lieu de fin de chaîne : avec le drapeau `m`, `$` seul
  // s'arrêterait au premier saut de ligne.
  const sections = raw.matchAll(/^-- MOD ([\w.$-]+) --$([\s\S]*?)(?=^-- |$(?![\s\S]))/gm)
  for (const m of sections) {
    const body = m[2] ?? ''
    add(
      m[1]!,
      body.match(/Mod File:\s*(?:.*[/\\])?(.+\.jar)/i)?.[1]?.trim() ?? null,
      body.match(/Failure message:\s*(.+)/i)?.[1]?.trim() ?? null,
      body,
    )
  }

  /* Fabric : une seule ligne, plusieurs mods possibles. */
  const suspected = raw.match(/^\s*Suspected mods?:\s*(.+)$/m)?.[1]
  if (suspected && !/none/i.test(suspected)) {
    // « Sodium (sodium) 0.5.3, Iris (iris) 1.6.9 »
    for (const m of suspected.matchAll(/\(([\w.$-]+)\)/g)) {
      add(m[1]!, null, null, raw)
    }
  }

  /* Mixins : le nom du fichier de configuration porte l'identifiant du mod. */
  if (!found.size) {
    for (const m of raw.matchAll(/mixins?\.([\w$-]+)(?:\.mixins)?\.json/g)) {
      add(m[1]!, null, 'Une transformation de mixin a échoué.', raw)
    }
    for (const m of raw.matchAll(/[Mm]ixin apply for mod ([\w.$-]+) failed/g)) {
      add(m[1]!, null, 'Une transformation de mixin a échoué.', raw)
    }
  }

  return [...found.values()]
}

/** Ce qui apparaît dans tous les rapports sans jamais en être la cause. */
const IGNORED = new Set([
  'minecraft',
  'forge',
  'neoforge',
  'fabric',
  'fabricloader',
  'fabric-api',
  'quilt_loader',
  'java',
  'mixin',
  'mixinextras',
])

/* -- Rapprochement avec les fichiers en place ------------------------------ */

async function listJars(row: ServerRow): Promise<string[]> {
  const target = contentTarget(row)
  if (!target) return []
  try {
    return (await readdir(join(resolve(row.data_dir), target.dir))).filter((n) =>
      /\.jar(\.disabled)?$/i.test(n),
    )
  } catch {
    return []
  }
}

/**
 * Retrouve le jar d'un mod à partir de son seul identifiant.
 *
 * Fabric ne donne que l'identifiant, or le geste de réparation porte sur un
 * fichier. Le rapprochement se fait sur le nom, ce qui marche parce que les
 * jars sont nommés d'après le mod — mais reste une heuristique : en cas de
 * doute on préfère ne rien proposer plutôt que de désactiver le mauvais mod.
 */
function matchJar(jars: string[], modId: string): string | null {
  const needle = modId.replace(/[_-]/g, '')
  const candidates = jars.filter((j) =>
    j.toLowerCase().replace(/[_-]/g, '').startsWith(needle),
  )
  return candidates.length === 1 ? candidates[0]! : null
}
