import type { MinecraftServer } from '#shared/types'

interface HostCapacityDto {
  totalMb: number
  reserveMb: number
  usableMb: number
  allocatedMb: number
  freeMb: number
}

/**
 * Le rack, côté interface.
 *
 * Le rafraîchissement suit la cadence de l'échantillonneur (30 s) : interroger
 * plus vite ne montrerait rien de neuf, seulement le même échantillon relu.
 * Après une action, on relit tout de suite parce que là, l'état a changé.
 */
const POLL_MS = 30_000

/** Pendant une installation, l'avancement bouge : on regarde plus souvent. */
const POLL_MS_INSTALLING = 3_000

export function useServers() {
  const { data, pending, error, refresh } = useFetch('/api/servers', {
    key: 'servers',
    default: () => ({ servers: [] as MinecraftServer[], host: null as HostCapacityDto | null }),
  })

  const servers = computed(() => data.value?.servers ?? [])
  const host = computed(() => data.value?.host ?? null)

  const busy = ref(new Set<string>())
  const actionError = ref<string | null>(null)

  async function act(id: string, action: 'start' | 'stop' | 'restart') {
    if (busy.value.has(id)) return
    busy.value = new Set(busy.value).add(id)
    actionError.value = null
    try {
      await $fetch(`/api/servers/${id}/${action}`, { method: 'POST' })
      await refresh()
    } catch (e: any) {
      actionError.value =
        e?.data?.statusMessage ?? e?.statusMessage ?? "L'action a échoué."
    } finally {
      const next = new Set(busy.value)
      next.delete(id)
      busy.value = next
    }
  }

  if (import.meta.client) {
    let timer: ReturnType<typeof setInterval> | null = null
    let currentDelay = 0

    // La cadence suit ce qu'il y a à voir, au lieu d'être fixée une fois pour
    // toutes : inutile d'interroger toutes les 3 s un rack au repos.
    watchEffect(() => {
      const installing = servers.value.some((s) => s.state === 'installing')
      const delay = installing ? POLL_MS_INSTALLING : POLL_MS
      if (delay === currentDelay) return
      currentDelay = delay
      if (timer) clearInterval(timer)
      timer = setInterval(refresh, delay)
    })

    onScopeDispose(() => timer && clearInterval(timer))
  }

  const combinedError = computed(
    () => actionError.value ?? (error.value ? 'Le rack n’a pas pu être lu.' : null),
  )

  return { servers, host, pending, error: combinedError, refresh, act, busy }
}
