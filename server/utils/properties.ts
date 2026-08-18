import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

/**
 * Lecture/écriture de server.properties.
 *
 * Le fichier est réécrit en préservant l'ordre, les commentaires et les clés
 * inconnues : on ne régénère pas un fichier « propre » à partir de ce que le
 * panneau sait, sinon toute clé posée à la main disparaîtrait au premier
 * enregistrement.
 */

export interface PropertyEntry {
  key: string
  value: string
}

const FILE = 'server.properties'

export async function readProperties(dataDir: string): Promise<PropertyEntry[]> {
  let raw: string
  try {
    raw = await readFile(join(dataDir, FILE), 'utf8')
  } catch {
    // Le fichier n'existe qu'après le premier démarrage du serveur.
    return []
  }

  const out: PropertyEntry[] = []
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = line.indexOf('=')
    if (eq === -1) continue
    out.push({ key: line.slice(0, eq).trim(), value: line.slice(eq + 1) })
  }
  return out
}

export async function writeProperties(
  dataDir: string,
  updates: Record<string, string>,
): Promise<void> {
  const path = join(dataDir, FILE)
  const raw = await readFile(path, 'utf8')
  const seen = new Set<string>()

  const lines = raw.split(/\r?\n/).map((line) => {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) return line

    const eq = line.indexOf('=')
    if (eq === -1) return line

    const key = line.slice(0, eq).trim()
    if (!(key in updates)) return line

    seen.add(key)
    return `${key}=${sanitize(updates[key]!)}`
  })

  // Une clé absente du fichier est ajoutée à la fin plutôt qu'ignorée
  // silencieusement.
  for (const [key, value] of Object.entries(updates)) {
    if (!seen.has(key)) lines.push(`${key}=${sanitize(value)}`)
  }

  await writeFile(path, lines.join('\n'), 'utf8')
}

/** Une valeur sur plusieurs lignes casserait le format du fichier. */
function sanitize(value: string): string {
  return value.replace(/[\r\n]+/g, ' ')
}
