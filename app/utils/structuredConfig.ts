import { parseDocument, type Document } from 'yaml'
import * as TOML from 'smol-toml'

/**
 * Édition en formulaire des configs de plugins/mods (YAML, TOML, JSON), en
 * alternative au texte brut : ces fichiers n'ont pas de schéma qu'on connaît
 * d'avance, contrairement à server.properties, donc pas de libellés — juste
 * les clés du fichier converties en champs typés.
 */

export type StructuredFormat = 'yaml' | 'json' | 'toml'

export function detectStructuredFormat(path: string): StructuredFormat | null {
  const dot = path.lastIndexOf('.')
  const ext = dot === -1 ? '' : path.slice(dot).toLowerCase()
  if (ext === '.yml' || ext === '.yaml') return 'yaml'
  if (ext === '.json' || ext === '.json5') return 'json'
  if (ext === '.toml') return 'toml'
  return null
}

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === 'object' && !Array.isArray(v)

const deepEqual = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)

/**
 * Ne réécrit dans le document YAML que les clés qui ont vraiment changé :
 * commentaires et mise en forme du reste du fichier survivent, comme pour
 * server.properties.
 */
function applyDiff(doc: Document, path: (string | number)[], before: unknown, after: unknown) {
  if (isPlainObject(before) && isPlainObject(after)) {
    for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) {
      if (!(key in after)) doc.deleteIn([...path, key])
      else if (!(key in before)) doc.setIn([...path, key], after[key])
      else applyDiff(doc, [...path, key], before[key], after[key])
    }
    return
  }
  if (!deepEqual(before, after)) doc.setIn(path, after)
}

export interface StructuredConfig {
  format: StructuredFormat
  /** Racine modifiable, en objet JS ordinaire pour le formulaire. */
  draft: unknown
  /** Reconstruit le texte du fichier à partir du brouillon édité. */
  serialize(edited: unknown): string
}

export function parseStructuredConfig(format: StructuredFormat, text: string): StructuredConfig {
  if (format === 'json') {
    const draft = text.trim() ? JSON.parse(text) : {}
    return { format, draft, serialize: (edited) => JSON.stringify(edited, null, 2) + '\n' }
  }

  if (format === 'toml') {
    const draft = TOML.parse(text)
    // smol-toml ne conserve pas les commentaires au ré-écrit : accepté faute
    // de bibliothèque TOML "à trous" équivalente à `yaml` en JS.
    return { format, draft, serialize: (edited) => TOML.stringify(edited as TOML.TomlPrimitive) }
  }

  const doc = parseDocument(text)
  const original = (doc.toJS() ?? {}) as unknown
  return {
    format,
    draft: JSON.parse(JSON.stringify(original)),
    serialize: (edited) => {
      if (isPlainObject(original) && isPlainObject(edited)) applyDiff(doc, [], original, edited)
      else if (!deepEqual(original, edited)) doc.contents = doc.createNode(edited)
      return String(doc)
    },
  }
}
