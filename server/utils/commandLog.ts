import type { ServerRow } from './servers'

/**
 * JOURNAL DES COMMANDES — qui a fait quoi.
 *
 * Minecraft ne journalise pas les commandes elles-mêmes, mais leur *retour* :
 * quand un joueur op (ou la console RCON) exécute `/give`, `/kill`,
 * `/gamemode`… le serveur diffuse aux opérateurs un message du type
 * « [Steve: Given [Diamond] * 64 to Steve] » et l'écrit tel quel dans son
 * propre journal. On n'a donc rien à instrumenter côté serveur : il suffit de
 * lire ce que le jeu dit déjà de lui-même, en continu, pour reconstituer qui a
 * triché et combien de fois.
 *
 * Ça ne capte que ce qu'un joueur op peut faire de visible (le gamerule
 * `sendCommandFeedback`, actif par défaut, doit rester activé), pas les
 * commandes qui échouent silencieusement ni celles d'un joueur sans droits.
 */

interface Parsed {
  player: string
  verb: string
  detail: string
}

/**
 * Une ligne de retour de commande a la forme
 * « [21:15:32] [Server thread/INFO]: [Steve: Given [Diamond] * 64 to Steve] ».
 * Le message peut lui-même contenir des crochets (noms d'objets) : on prend le
 * dernier « ] » de la ligne comme fermeture, jamais le premier.
 */
const FEEDBACK_LINE = /^\[[^\]]*\]\s*\[[^/\]]+\/(?:INFO|WARN)\]:\s*\[([A-Za-z0-9_]{1,16}):\s(.+)\]\s*$/

/** Classe le message en verbe court, pour grouper et étiqueter côté interface. */
const VERB_PATTERNS: [RegExp, string][] = [
  [/^(Given|Gave)\b/i, 'give'],
  [/^Killed\b/i, 'kill'],
  [/game mode/i, 'gamemode'],
  [/^Teleported\b/i, 'teleport'],
  [/^Set the time\b/i, 'time'],
  [/^Changed the weather\b/i, 'weather'],
  [/^Opped\b/i, 'op'],
  [/^De-?opped\b/i, 'deop'],
  [/whitelist/i, 'whitelist'],
  [/^Banned\b/i, 'ban'],
  [/^(Unbanned|Pardoned)\b/i, 'pardon'],
  [/^Kicked\b/i, 'kick'],
  [/^Enchanted\b/i, 'enchant'],
  [/\beffects?\b/i, 'effect'],
  [/experience/i, 'xp'],
  [/^Cleared\b/i, 'clear'],
  [/^Summoned\b/i, 'summon'],
  [/^Set the difficulty\b/i, 'difficulty'],
  [/gamerule/i, 'gamerule'],
  [/^Set the spawn point\b/i, 'spawnpoint'],
]

function classify(detail: string): string {
  for (const [re, verb] of VERB_PATTERNS) {
    if (re.test(detail)) return verb
  }
  return 'other'
}

export function parseCommandFeedback(line: string): Parsed | null {
  const m = FEEDBACK_LINE.exec(line.trim())
  if (!m) return null
  const [, player, detail] = m as unknown as [string, string, string]
  return { player, verb: classify(detail), detail }
}

export function recordCommand(serverId: string, player: string, verb: string, detail: string): void {
  useDb()
    .prepare(
      'INSERT INTO command_log (server_id, player, verb, detail, created_at) VALUES (?, ?, ?, ?, ?)',
    )
    .run(serverId, player, verb, detail, Date.now())
}

export interface CommandLogEntry {
  id: number
  player: string
  verb: string
  detail: string
  createdAt: number
}

export function recentCommands(serverId: string, limit = 200): CommandLogEntry[] {
  return useDb()
    .prepare(
      `SELECT id, player, verb, detail, created_at as createdAt
         FROM command_log
        WHERE server_id = ?
        ORDER BY created_at DESC
        LIMIT ?`,
    )
    .all(serverId, limit) as CommandLogEntry[]
}

export interface CommandLogSummary {
  player: string
  verb: string
  count: number
  lastAt: number
}

/** Un joueur, une commande, combien de fois — pour « Steve a fait /kill 12 fois ». */
export function commandSummary(serverId: string, limit = 50): CommandLogSummary[] {
  return useDb()
    .prepare(
      `SELECT player, verb, COUNT(*) as count, MAX(created_at) as lastAt
         FROM command_log
        WHERE server_id = ?
        GROUP BY player, verb
        ORDER BY count DESC
        LIMIT ?`,
    )
    .all(serverId, limit) as CommandLogSummary[]
}

/** Rétention un mois, comme les autres journaux du panneau. */
export function purgeOldCommandLog(maxAgeMs = 30 * 24 * 60 * 60 * 1000): void {
  useDb().prepare('DELETE FROM command_log WHERE created_at < ?').run(Date.now() - maxAgeMs)
}

/* -- Suivi en continu ------------------------------------------------------
 *
 * Contrairement à la console (server/routes/api/servers/[id]/console.ts), ce
 * flux doit tourner même quand personne ne regarde : sinon on ne capte que
 * les commandes passées pendant qu'un onglet console est ouvert.
 */

const watchers = new Map<string, () => void>()

export async function syncCommandWatchers(rows: ServerRow[]): Promise<void> {
  const runningIds = new Set<string>()

  for (const row of rows) {
    if (row.game !== 'minecraft') continue

    const status = await containerStatus(row.id)
    if (status.state !== 'running') continue
    runningIds.add(row.id)

    if (watchers.has(row.id)) continue

    try {
      // `tail: 0` : on ne veut que ce qui se passe à partir de maintenant, pas
      // rejouer l'historique à chaque redémarrage du panneau ou du serveur.
      const stop = await followLogs(
        row.id,
        (line) => {
          const parsed = parseCommandFeedback(line)
          if (parsed) recordCommand(row.id, parsed.player, parsed.verb, parsed.detail)
        },
        0,
      )
      watchers.set(row.id, stop)
    } catch {
      // Le conteneur a pu s'arrêter entre les deux appels : on retentera au
      // prochain relevé du sampler.
    }
  }

  for (const [id, stop] of watchers) {
    if (runningIds.has(id)) continue
    stop()
    watchers.delete(id)
  }
}

export function stopAllCommandWatchers(): void {
  for (const stop of watchers.values()) stop()
  watchers.clear()
}
