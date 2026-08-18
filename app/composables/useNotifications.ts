import type { EventLevel } from '#shared/types'

interface AppEvent {
  id: number
  serverId: string | null
  serverName: string | null
  level: EventLevel
  title: string
  detail: string
  createdAt: number
}

const STORAGE_KEY = 'cairn-notifications-seen-at'

/**
 * Le centre de notifications, partagé entre la cloche mobile et la cloche
 * de la barre latérale desktop : une seule requête, un seul état de lecture.
 *
 * « Lu » vit dans le navigateur, pas en base : un panneau à quelques admins
 * n'a pas besoin d'une table dédiée pour ça, et ça évite d'en synchroniser
 * l'état entre appareils pour un gain qui ne le justifie pas.
 */
export function useNotifications() {
  const events = useState<AppEvent[]>('notifications', () => [])
  const lastSeenAt = useState<number>('notifications-seen-at', () => 0)

  async function refresh() {
    events.value = (await $fetch<{ events: AppEvent[] }>('/api/events', { query: { limit: 30 } })).events
  }

  function markSeen() {
    lastSeenAt.value = Date.now()
    if (import.meta.client) localStorage.setItem(STORAGE_KEY, String(lastSeenAt.value))
  }

  const unseenCount = computed(
    () => events.value.filter((e) => e.createdAt > lastSeenAt.value).length,
  )

  if (import.meta.client && !lastSeenAt.value) {
    const stored = Number(localStorage.getItem(STORAGE_KEY))
    if (stored) lastSeenAt.value = stored
  }

  return { events, unseenCount, refresh, markSeen }
}
