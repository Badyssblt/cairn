import { readdir, readFile, stat, writeFile, rm, mkdir } from 'node:fs/promises'
import { join, relative, resolve, sep } from 'node:path'

/**
 * Gestionnaire de fichiers, borné au dossier du serveur.
 *
 * Chaque chemin reçu de l'extérieur est résolu puis vérifié : sans ce contrôle,
 * un `../../` suffirait à lire ou écraser n'importe quoi sur l'hôte depuis le
 * navigateur.
 */
export function safeJoin(dataDir: string, relPath: string): string {
  const root = resolve(dataDir)
  const target = resolve(root, '.' + sep + (relPath || '.'))

  if (target !== root && !target.startsWith(root + sep)) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Chemin hors du dossier du serveur.',
    })
  }
  return target
}

export interface FileEntry {
  name: string
  path: string
  isDir: boolean
  size: number
  modified: number
  /** Modifiable dans l'éditeur intégré. */
  editable: boolean
}

/** Extensions qu'on accepte d'ouvrir en texte. Le reste se télécharge. */
const TEXT_EXT = new Set([
  '.txt', '.properties', '.json', '.json5', '.yml', '.yaml', '.toml', '.cfg',
  '.conf', '.ini', '.log', '.md', '.mcmeta', '.snbt', '.js', '.lua', '.sh',
  '.xml', '.csv', '.tsv',
])

/** Au-delà, l'éditeur du navigateur devient pénible et le transfert lourd. */
export const MAX_EDIT_BYTES = 2 * 1024 * 1024

function isEditable(name: string, size: number): boolean {
  const dot = name.lastIndexOf('.')
  const ext = dot === -1 ? '' : name.slice(dot).toLowerCase()
  return size <= MAX_EDIT_BYTES && (TEXT_EXT.has(ext) || !name.includes('.'))
}

export async function listDirectory(
  dataDir: string,
  relPath: string,
): Promise<FileEntry[]> {
  const dir = safeJoin(dataDir, relPath)
  const entries = await readdir(dir, { withFileTypes: true })

  const out = await Promise.all(
    entries.map(async (e): Promise<FileEntry | null> => {
      const full = join(dir, e.name)
      try {
        const s = await stat(full)
        return {
          name: e.name,
          path: relative(resolve(dataDir), full).split(sep).join('/'),
          isDir: s.isDirectory(),
          size: s.isDirectory() ? 0 : s.size,
          modified: s.mtimeMs,
          editable: !s.isDirectory() && isEditable(e.name, s.size),
        }
      } catch {
        return null
      }
    }),
  )

  // Dossiers d'abord, puis alphabétique : l'ordre attendu d'un explorateur.
  return out
    .filter((e): e is FileEntry => e !== null)
    .sort((a, b) =>
      a.isDir === b.isDir ? a.name.localeCompare(b.name, 'fr') : a.isDir ? -1 : 1,
    )
}

export async function readTextFile(dataDir: string, relPath: string): Promise<string> {
  const target = safeJoin(dataDir, relPath)
  const s = await stat(target)

  if (s.isDirectory()) {
    throw createError({ statusCode: 400, statusMessage: "Ceci est un dossier." })
  }
  if (s.size > MAX_EDIT_BYTES) {
    throw createError({
      statusCode: 413,
      statusMessage: 'Ce fichier est trop volumineux pour être ouvert ici.',
    })
  }
  return await readFile(target, 'utf8')
}

export async function writeTextFile(
  dataDir: string,
  relPath: string,
  content: string,
): Promise<void> {
  const target = safeJoin(dataDir, relPath)
  await mkdir(resolve(target, '..'), { recursive: true })
  await writeFile(target, content, 'utf8')
}

export async function deleteEntry(dataDir: string, relPath: string): Promise<void> {
  const target = safeJoin(dataDir, relPath)
  if (target === resolve(dataDir)) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Le dossier du serveur ne peut pas être supprimé ici.',
    })
  }
  await rm(target, { recursive: true, force: true })
}
