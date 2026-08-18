import { randomBytes } from 'node:crypto'
import { statSync } from 'node:fs'
import { mkdir, rm, stat } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { create as tarCreate, extract as tarExtract, list as tarList } from 'tar'
import type { ServerRow } from './servers'

/**
 * SAUVEGARDES
 *
 * Deux décisions structurent ce fichier.
 *
 * **Les archives vivent hors du dossier du serveur.** Les y ranger ferait
 * qu'une sauvegarde contiendrait les précédentes, et la taille doublerait à
 * chaque fois.
 *
 * **On fait taire les écritures avant d'archiver.** Copier un monde pendant
 * que le serveur y écrit produit une archive incohérente, dont on ne
 * s'aperçoit qu'au moment de la restaurer — c'est-à-dire au pire moment.
 * Quand le jeu sait suspendre ses sauvegardes, on le lui demande ; sinon on
 * le dit franchement plutôt que de promettre une cohérence qu'on n'a pas.
 */

/** Dossier des archives, frère de la racine des données. */
function backupRoot(): string {
  return resolve(useRuntimeConfig().dataRoot, '..', 'cairn-backups')
}

/**
 * Étendue d'une archive.
 *
 * `world` ne prend que le monde chargé et ses dimensions : une fraction de la
 * taille, et c'est celle qu'on restaure presque toujours. Surtout, la
 * restaurer ne défait pas une mise à jour de mods faite entre-temps — là où
 * une archive complète ramène tout l'état du serveur, y compris ce qu'on ne
 * voulait pas rendre.
 */
export type BackupScope = 'full' | 'world'

export interface BackupRow {
  id: string
  server_id: string
  name: string
  path: string
  size_bytes: number | null
  state: string
  error: string | null
  created_at: number
  scope: BackupScope
}

export function listBackups(serverId: string): BackupRow[] {
  return useDb()
    .prepare('SELECT * FROM backups WHERE server_id = ? ORDER BY created_at DESC')
    .all(serverId) as BackupRow[]
}

export function getBackup(id: string): BackupRow | null {
  return (useDb().prepare('SELECT * FROM backups WHERE id = ?').get(id) as
    | BackupRow
    | undefined) ?? null
}

/** Sauvegardes en cours dans ce process, pour ne pas en lancer deux. */
const running = new Set<string>()

/**
 * Suspend les écritures du monde le temps de l'archive, si le jeu le permet.
 * Renvoie de quoi les reprendre, et un avertissement s'il n'a rien pu faire.
 */
async function quiesce(row: ServerRow): Promise<{ resume: () => Promise<void>; warning: string | null }> {
  const status = await containerStatus(row.id)
  if (!status.exists || status.state !== 'running') {
    return { resume: async () => {}, warning: null }
  }

  const adapter = gameAdapter(row.game)
  const flush = adapter.backupFlush
  if (!flush) {
    return {
      resume: async () => {},
      warning:
        `${adapter.name} ne sait pas suspendre ses écritures : l'archive a été ` +
        `prise pendant que le serveur tournait et peut être incohérente. ` +
        `Arrête le serveur avant de sauvegarder pour une archive sûre.`,
    }
  }

  const rcon = await serverRcon(row)
  if (!rcon) {
    return {
      resume: async () => {},
      warning: "Le serveur n'a pas répondu : l'archive peut être incohérente.",
    }
  }

  try {
    for (const cmd of flush.before) await rcon.command(cmd)
  } catch {
    return {
      resume: async () => {},
      warning: "Les écritures n'ont pas pu être suspendues ; l'archive peut être incohérente.",
    }
  }

  return {
    resume: async () => {
      // Reprendre les écritures est impératif : un serveur laissé en
      // `save-off` ne sauvegarderait plus rien jusqu'à son redémarrage.
      const r = await serverRcon(row).catch(() => null)
      if (!r) return
      for (const cmd of flush.after) await r.command(cmd).catch(() => {})
    },
    warning: null,
  }
}

export function startBackup(
  row: ServerRow,
  label?: string,
  scope: BackupScope = 'full',
): string {
  const id = randomBytes(8).toString('hex')
  const name = label?.trim() || new Date().toLocaleString('fr-FR')
  const file = join(backupRoot(), row.id, `${id}.tar.gz`)

  useDb()
    .prepare(
      `INSERT INTO backups (id, server_id, name, path, state, created_at, scope)
       VALUES (?, ?, ?, ?, 'running', ?, ?)`,
    )
    .run(id, row.id, name, file, Date.now(), scope)

  if (running.has(row.id)) {
    finish(id, "Une sauvegarde est déjà en cours sur ce serveur.")
    return id
  }
  running.add(row.id)

  runBackup(row, file, scope)
    .then((warning) => finish(id, null, file, warning))
    .catch((e: any) => {
      const reason = e?.message ?? 'La sauvegarde a échoué.'
      finish(id, reason)
      // Une sauvegarde ratée est silencieuse par nature : sans alerte, on ne
      // s'en aperçoit qu'au moment d'en avoir besoin.
      recordEvent('bad', `Sauvegarde de ${row.name} échouée`, reason, row.id)
    })
    .finally(() => running.delete(row.id))

  return id
}

async function runBackup(
  row: ServerRow,
  file: string,
  scope: BackupScope,
): Promise<string | null> {
  await mkdir(join(backupRoot(), row.id), { recursive: true })

  const paths = scope === 'world' ? await worldPaths(row) : ['.']
  if (!paths.length) {
    throw new Error(
      "Aucun monde trouvé : le serveur n'a pas encore généré sa carte. " +
        'Démarre-le une fois, ou sauvegarde le serveur entier.',
    )
  }

  const { resume, warning } = await quiesce(row)
  try {
    await tarCreate(
      { gzip: true, cwd: resolve(row.data_dir), file, portable: true },
      paths,
    )
  } finally {
    await resume()
  }
  return warning
}

function finish(id: string, error: string | null, file?: string, warning?: string | null) {
  let size: number | null = null
  if (!error && file) {
    try {
      size = statSync(file).size
    } catch {
      size = null
    }
  }
  useDb()
    .prepare('UPDATE backups SET state = ?, error = ?, size_bytes = ? WHERE id = ?')
    .run(error ? 'failed' : 'done', error ?? warning ?? null, size, id)
}

/**
 * Restaure une archive par-dessus le dossier du serveur.
 *
 * Le serveur est arrêté d'abord, et ce que l'archive couvre est vidé : une
 * restauration doit rendre l'état exact de l'archive, pas un mélange avec ce
 * qui traînait.
 *
 * L'étendue commande ce qu'on efface. Une archive complète remplace tout le
 * dossier. Une archive du monde seul n'efface que les dossiers de monde
 * qu'elle contient : vider tout le serveur pour restaurer une carte
 * supprimerait les mods, qui n'y sont pas — le serveur ne redémarrerait plus.
 */
export async function restoreBackup(row: ServerRow, backup: BackupRow) {
  const status = await containerStatus(row.id)
  if (status.exists && status.state !== 'stopped') {
    closeRcon(row.id)
    await stopContainer(row.id)
  }

  const dir = resolve(row.data_dir)

  if (backup.scope === 'world') {
    // Les dossiers à remplacer sont ceux de l'archive, pas ceux d'aujourd'hui :
    // `level-name` a pu changer depuis, et effacer le monde courant laisserait
    // celui de l'archive à côté sans que personne ne le charge.
    for (const name of await archivedWorldDirs(backup.path)) {
      await rm(join(dir, name), { recursive: true, force: true })
    }
  } else {
    await rm(dir, { recursive: true, force: true })
    await mkdir(dir, { recursive: true })
  }

  await tarExtract({ file: backup.path, cwd: dir })
}

/** Les dossiers de premier niveau d'une archive de monde. */
async function archivedWorldDirs(path: string): Promise<string[]> {
  const names = new Set<string>()

  await tarList({
    file: path,
    onReadEntry: (entry) => {
      const first = String(entry.path).split('/').filter(Boolean)[0]
      if (first && first !== '.') names.add(first)
    },
  })

  return [...names]
}

export async function deleteBackup(backup: BackupRow) {
  await rm(backup.path, { force: true })
  useDb().prepare('DELETE FROM backups WHERE id = ?').run(backup.id)
}

/** Taille réelle de l'archive sur le disque, ou null si elle a disparu. */
export async function backupSize(backup: BackupRow): Promise<number | null> {
  try {
    return (await stat(backup.path)).size
  } catch {
    return null
  }
}
