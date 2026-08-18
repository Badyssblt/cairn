import type { EventLevel } from '#shared/types'

const DISCORD_COLORS: Record<EventLevel, number> = {
  bad: 0xd2504a,
  warn: 0xe8913a,
  good: 0x5fae6e,
}

/**
 * Relais Discord, silencieux par nature : une alerte qui échoue ne doit
 * jamais faire tomber ce qu'elle annonçait, et sans webhook enregistré on ne
 * fait rien.
 */
async function notifyDiscord(level: EventLevel, title: string, detail: string): Promise<void> {
  const url = getSetting('discord_webhook')?.trim()
  if (!url) return

  try {
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: 'Cairn',
        embeds: [
          {
            title,
            description: detail,
            color: DISCORD_COLORS[level],
            timestamp: new Date().toISOString(),
          },
        ],
      }),
      signal: AbortSignal.timeout(8000),
    })
  } catch {
    // Voir le commentaire au-dessus de la fonction.
  }
}

export interface AppEvent {
  id: number
  serverId: string | null
  serverName: string | null
  level: EventLevel
  title: string
  detail: string
  createdAt: number
}

/**
 * Point d'entrée unique pour « il s'est passé quelque chose qui mérite d'être
 * vu » : ça alimente le centre de notifications du panneau — qui ne doit
 * jamais dépendre de Discord pour savoir ce qui s'est passé chez lui — et
 * Discord en plus, si un webhook est configuré.
 */
export async function recordEvent(
  level: EventLevel,
  title: string,
  detail: string,
  serverId: string | null = null,
): Promise<void> {
  useDb()
    .prepare(
      'INSERT INTO events (server_id, level, title, detail, created_at) VALUES (?, ?, ?, ?, ?)',
    )
    .run(serverId, level, title, detail, Date.now())

  await notifyDiscord(level, title, detail)
}

export function recentEvents(limit = 30): AppEvent[] {
  return useDb()
    .prepare(
      `SELECT e.id, e.server_id as serverId, s.name as serverName,
              e.level, e.title, e.detail, e.created_at as createdAt
         FROM events e LEFT JOIN servers s ON s.id = e.server_id
        ORDER BY e.created_at DESC LIMIT ?`,
    )
    .all(limit) as AppEvent[]
}

/** Rétention un mois : assez pour un historique utile, pas une base qui grossit sans fin. */
export function purgeOldEvents(maxAgeMs = 30 * 24 * 60 * 60 * 1000) {
  useDb().prepare('DELETE FROM events WHERE created_at < ?').run(Date.now() - maxAgeMs)
}
