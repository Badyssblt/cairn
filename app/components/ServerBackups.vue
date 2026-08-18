<script setup lang="ts">
const props = defineProps<{ serverId: string; running: boolean }>()

interface Backup {
  id: string
  name: string
  sizeBytes: number | null
  state: string
  note: string | null
  createdAt: number
}

const { data, refresh, pending } = await useFetch<{ backups: Backup[] }>(
  () => `/api/servers/${props.serverId}/backups`,
)

const label = ref('')
const busy = ref(false)
const message = ref<{ text: string; ok: boolean } | null>(null)

const anyRunning = computed(() =>
  (data.value?.backups ?? []).some((b) => b.state === 'running'),
)

async function create() {
  busy.value = true
  message.value = null
  try {
    await $fetch(`/api/servers/${props.serverId}/backups`, {
      method: 'POST',
      body: { name: label.value.trim() || undefined },
    })
    label.value = ''
    await refresh()
  } catch (e: any) {
    message.value = { text: e?.data?.statusMessage ?? "La sauvegarde a échoué.", ok: false }
  } finally {
    busy.value = false
  }
}

const restoring = ref<string | null>(null)

async function restore(b: Backup) {
  const ok = globalThis.confirm(
    `Restaurer « ${b.name} » ?\n\nLe serveur sera arrêté et son contenu actuel remplacé ` +
      `par celui de la sauvegarde. Ce qui n'est pas dans l'archive sera perdu.`,
  )
  if (!ok) return

  restoring.value = b.id
  message.value = null
  try {
    await $fetch(`/api/servers/${props.serverId}/backups/${b.id}/restore`, {
      method: 'POST',
    })
    message.value = {
      text: 'Restauré. Le serveur est arrêté : vérifie, puis démarre-le.',
      ok: true,
    }
  } catch (e: any) {
    message.value = { text: e?.data?.statusMessage ?? 'La restauration a échoué.', ok: false }
  } finally {
    restoring.value = null
  }
}

async function remove(b: Backup) {
  if (!globalThis.confirm(`Supprimer « ${b.name} » ? C'est définitif.`)) return
  try {
    await $fetch(`/api/servers/${props.serverId}/backups/${b.id}`, { method: 'DELETE' })
    await refresh()
  } catch (e: any) {
    message.value = { text: e?.data?.statusMessage ?? 'La suppression a échoué.', ok: false }
  }
}

const size = (n: number | null) =>
  n === null ? '—' : n >= 1073741824 ? formatBytesGb(n) : `${Math.round(n / 1048576)} Mo`

// Une sauvegarde en cours se termine sans nous : on relit tant qu'il y en a.
onMounted(() => {
  const timer = setInterval(() => {
    if (anyRunning.value) refresh()
  }, 5000)
  onBeforeUnmount(() => clearInterval(timer))
})
</script>

<template>
  <div>
    <section class="rounded-slab border border-vein bg-stone/30 p-4">
      <h3 class="eyebrow">Nouvelle sauvegarde</h3>
      <p class="mt-1.5 text-[13px] text-ash">
        <template v-if="running">
          Le serveur tourne : ses écritures seront suspendues le temps de
          l'archive, pour qu'elle soit cohérente.
        </template>
        <template v-else>
          Le serveur est arrêté : c'est le moment le plus sûr pour archiver.
        </template>
      </p>
      <div class="mt-3 flex flex-wrap gap-2">
        <input
          v-model="label"
          placeholder="Avant la mise à jour…"
          aria-label="Nom de la sauvegarde"
          class="h-9 min-w-[200px] flex-1 rounded-block border border-vein bg-deepslate px-2.5 text-[13px] text-chalk placeholder:text-ash-dim/70 focus:border-torch focus:outline-none"
        />
        <UiBtn variant="primary" :disabled="busy || anyRunning" @click="create">
          {{ anyRunning ? 'Sauvegarde en cours…' : 'Sauvegarder maintenant' }}
        </UiBtn>
      </div>
    </section>

    <p
      v-if="message"
      role="status"
      class="mt-3 rounded-block border px-3 py-2 text-[12px]"
      :class="
        message.ok
          ? 'border-torch-dim bg-torch-dim/20 text-torch'
          : 'border-redstone-dim bg-redstone-dim/20 text-redstone'
      "
    >
      {{ message.text }}
    </p>

    <div v-if="pending" class="mt-4 text-[13px] text-ash-dim">Lecture…</div>

    <p
      v-else-if="!data?.backups.length"
      class="mt-4 rounded-slab border border-dashed border-vein px-5 py-10 text-center text-[13px] text-ash"
    >
      Aucune sauvegarde. C'est la seule chose qui ne se refait pas — prends-en une.
    </p>

    <div v-else class="mt-4 overflow-hidden rounded-slab border border-vein">
      <div
        v-for="b in data.backups"
        :key="b.id"
        class="group flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-vein px-4 py-3 last:border-b-0"
      >
        <div class="min-w-0 flex-1">
          <p class="truncate text-[13px] text-chalk">{{ b.name }}</p>
          <p class="mt-0.5 font-mono text-[11px] text-ash-dim">
            {{ new Date(b.createdAt).toLocaleString('fr-FR') }}
            <template v-if="b.state === 'done'"> · {{ size(b.sizeBytes) }}</template>
          </p>
          <!-- Une archive prise à chaud sans pouvoir suspendre les écritures
               reste utilisable, mais il faut le savoir. -->
          <p v-if="b.note" class="mt-1 text-[11px]" :class="b.state === 'failed' ? 'text-redstone' : 'text-torch'">
            {{ b.note }}
          </p>
        </div>

        <span
          v-if="b.state === 'running'"
          class="font-mono text-[11px] text-lapis"
        >
          archivage…
        </span>
        <span v-else-if="b.state === 'failed'" class="font-mono text-[11px] text-redstone">
          échec
        </span>

        <div v-else class="flex flex-wrap gap-1.5">
          <UiBtn
            size="sm"
            :to="`/api/servers/${serverId}/backups/${b.id}/download`"
            external
          >
            Télécharger
          </UiBtn>
          <UiBtn size="sm" :disabled="restoring === b.id" @click="restore(b)">
            {{ restoring === b.id ? 'Restauration…' : 'Restaurer' }}
          </UiBtn>
          <UiBtn size="sm" variant="danger" @click="remove(b)">Supprimer</UiBtn>
        </div>
      </div>
    </div>
  </div>
</template>
