import type { MinecraftServer } from '#shared/types'

/**
 * Le serveur affiché, partagé entre la coque et la section ouverte.
 *
 * La clé de cache est l'identifiant : la barre latérale et la page lisent la
 * même requête au lieu d'en lancer deux, et une action dans la page rafraîchit
 * aussi le statut affiché à gauche.
 */
export function useServerDetail() {
  const route = useRoute()
  const id = computed(() => String(route.params.id))

  const { data, refresh, error, pending } = useFetch<{ server: MinecraftServer }>(
    () => `/api/servers/${id.value}`,
    { key: `server-detail-${id.value}` },
  )

  const server = computed(() => data.value?.server ?? null)

  const busy = useState(`server-busy-${id.value}`, () => false)
  const actionError = useState<string | null>(`server-error-${id.value}`, () => null)
  /** Rempli quand un démarrage échoue à cause d'un port pris par un autre serveur en marche. */
  const portConflict = useState<{ conflictId: string; conflictName: string } | null>(
    `server-port-conflict-${id.value}`,
    () => null,
  )

  async function act(action: 'start' | 'stop' | 'restart', stopConflicting = false) {
    busy.value = true
    actionError.value = null
    portConflict.value = null
    try {
      await $fetch(`/api/servers/${id.value}/${action}`, {
        method: 'POST',
        body: action === 'start' ? { stopConflicting } : undefined,
      })
      await refresh()
    } catch (e: any) {
      actionError.value = e?.data?.statusMessage ?? "L'action a échoué."
      const conflictId = e?.data?.data?.conflictId
      portConflict.value = conflictId
        ? { conflictId, conflictName: e.data.data.conflictName }
        : null
    } finally {
      busy.value = false
    }
  }

  return { id, server, refresh, error, pending, busy, actionError, portConflict, act }
}
