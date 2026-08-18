<script setup lang="ts">
import type { MinecraftServer } from '#shared/types'

const props = defineProps<{ server: MinecraftServer }>()

const message = ref<{ text: string; ok: boolean } | null>(null)
const busy = ref(false)

/* -- Nettoyage ------------------------------------------------------------ */
const { data: cleanup, refresh: refreshCleanup } = await useFetch<{
  folders: { name: string; sizeBytes: number; disposable: boolean }[]
  reclaimable: number
}>(() => `/api/servers/${props.server.id}/cleanup`)

const size = (n: number) =>
  n >= 1073741824
    ? formatBytesGb(n)
    : n >= 1048576
      ? `${Math.round(n / 1048576)} Mo`
      : `${Math.round(n / 1024)} Ko`

async function purge(folder: string) {
  if (!globalThis.confirm(`Vider « ${folder} » ? Son contenu est définitivement supprimé.`)) return
  try {
    await $fetch(`/api/servers/${props.server.id}/files`, {
      method: 'DELETE',
      query: { path: folder },
    })
    await refreshCleanup()
    message.value = { text: `« ${folder} » a été vidé.`, ok: true }
  } catch (e: any) {
    message.value = { text: e?.data?.statusMessage ?? 'La suppression a échoué.', ok: false }
  }
}

/* -- Ressources ----------------------------------------------------------- */

/**
 * Seuil sous lequel les flags d'Aikar se retournent contre le serveur : ils
 * agrandissent la jeune génération, ce qui n'a de sens que si le tas est assez
 * grand pour que la vieille génération reste confortable.
 */
const AIKAR_MIN_HEAP_MB = 4096

const memoryMb = ref(props.server.memoryMb)
const aikar = ref(Boolean(props.server.aikarFlags))
watchEffect(() => {
  memoryMb.value = props.server.memoryMb
  aikar.value = Boolean(props.server.aikarFlags)
})

const isMinecraft = computed(() => props.server.game === 'minecraft')
const stopped = computed(() => props.server.state === 'stopped')

const resourcesDirty = computed(
  () =>
    memoryMb.value !== props.server.memoryMb ||
    aikar.value !== Boolean(props.server.aikarFlags),
)

/** La marge hors-tas, telle que le conteneur la reçoit réellement. */
const overheadMb = computed(() =>
  isMinecraft.value ? Math.max(1024, Math.round(memoryMb.value * 0.25)) : 0,
)

const gb = formatGb

async function saveResources() {
  busy.value = true
  message.value = null
  try {
    await $fetch(`/api/servers/${props.server.id}/resources`, {
      method: 'PATCH',
      body: {
        memoryMb: Number(memoryMb.value),
        ...(isMinecraft.value ? { aikarFlags: aikar.value } : {}),
      },
    })
    message.value = {
      text: 'Ressources appliquées. Le conteneur a été refait ; le dossier de données n’a pas bougé.',
      ok: true,
    }
    await refreshNuxtData()
  } catch (e: any) {
    message.value = { text: e?.data?.statusMessage ?? "Le changement a échoué.", ok: false }
  } finally {
    busy.value = false
  }
}

/* -- Clonage -------------------------------------------------------------- */
const cloneName = ref('')
const clonePort = ref(props.server.hostPort + 10)
const cloneWorld = ref(false)

async function clone() {
  busy.value = true
  message.value = null
  try {
    const res = await $fetch(`/api/servers/${props.server.id}/clone`, {
      method: 'POST',
      body: { name: cloneName.value.trim(), hostPort: clonePort.value, withWorld: cloneWorld.value },
    })
    await navigateTo(`/servers/${res.server.id}`)
  } catch (e: any) {
    message.value = { text: e?.data?.statusMessage ?? 'Le clonage a échoué.', ok: false }
    busy.value = false
  }
}

/* -- Réinitialisation du monde -------------------------------------------- */
const seed = ref('')
const confirmName = ref('')

async function resetWorld() {
  busy.value = true
  message.value = null
  try {
    const res = await $fetch(`/api/servers/${props.server.id}/world`, {
      method: 'POST',
      body: { action: 'reset', seed: seed.value.trim(), confirm: confirmName.value.trim() },
    })
    confirmName.value = ''
    message.value = {
      text: `Monde effacé (${res.removed.join(', ') || 'rien à supprimer'}). Démarre le serveur pour en générer un nouveau.`,
      ok: true,
    }
  } catch (e: any) {
    message.value = { text: e?.data?.statusMessage ?? 'La réinitialisation a échoué.', ok: false }
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div class="space-y-4">
    <p
      v-if="message"
      role="status"
      class="rounded-block border px-3 py-2 text-[12px]"
      :class="message.ok ? 'border-torch-dim bg-torch-dim/20 text-torch' : 'border-redstone-dim bg-redstone-dim/20 text-redstone'"
    >
      {{ message.text }}
    </p>

    <!-- Espace disque -->
    <section class="rounded-slab border border-vein bg-stone/30 p-4">
      <div class="flex flex-wrap items-baseline justify-between gap-3">
        <h3 class="eyebrow">Ce qui occupe le disque</h3>
        <span v-if="cleanup?.reclaimable" class="font-mono text-[11px] text-torch">
          {{ size(cleanup.reclaimable) }} récupérables
        </span>
      </div>
      <div class="mt-3 space-y-1.5">
        <div
          v-for="f in cleanup?.folders ?? []"
          :key="f.name"
          class="group flex items-center gap-3"
        >
          <span class="w-40 shrink-0 truncate font-mono text-[12px] text-chalk">{{ f.name }}</span>
          <div class="h-1.5 flex-1 overflow-hidden rounded-[2px] bg-deepslate">
            <div
              class="h-full rounded-[1px]"
              :class="f.disposable ? 'bg-torch' : 'bg-vein-lit'"
              :style="{ width: `${Math.max(2, (f.sizeBytes / (cleanup?.folders[0]?.sizeBytes || 1)) * 100)}%` }"
            />
          </div>
          <span class="w-16 shrink-0 text-right font-mono text-[11px] text-ash-dim">
            {{ size(f.sizeBytes) }}
          </span>
          <button
            v-if="f.disposable"
            type="button"
            class="shrink-0 text-[11px] text-ash-dim opacity-0 transition-opacity hover:text-redstone group-hover:opacity-100"
            @click="purge(f.name)"
          >
            Vider
          </button>
          <span v-else class="w-10 shrink-0" />
        </div>
      </div>
      <p class="mt-3 text-[12px] text-ash-dim">
        Les journaux et rapports de plantage s'accumulent sans limite ; ils se
        vident sans risque.
      </p>
    </section>

    <!-- Ressources -->
    <section class="rounded-slab border border-vein bg-stone/30 p-4">
      <h3 class="eyebrow">Mémoire et machine virtuelle Java</h3>

      <div class="mt-3 grid max-w-lg gap-4 sm:grid-cols-2">
        <UiField
          v-model.number="memoryMb"
          label="Tas Java (Mo)"
          type="number"
          mono
          :disabled="!stopped"
        />
      </div>

      <!-- La décomposition, dite explicitement : sans elle, l'écart entre la
           valeur saisie et la réservation réelle passe pour une erreur. -->
      <p class="mt-2 text-[12px] text-ash-dim">
        <template v-if="isMinecraft">
          {{ gb(memoryMb) }} Go de tas + {{ gb(overheadMb) }} Go que la JVM consomme
          hors-tas (metaspace, threads, buffers réseau) =
          <span class="text-chalk">{{ gb(memoryMb + overheadMb) }} Go réservés</span>
          au conteneur. C'est ce dernier chiffre qui compte dans la capacité de l'hôte.
        </template>
        <template v-else>
          {{ gb(memoryMb) }} Go réservés au conteneur.
        </template>
      </p>

      <label v-if="isMinecraft" class="mt-4 flex items-start gap-2.5">
        <input
          v-model="aikar"
          type="checkbox"
          :disabled="!stopped"
          class="mt-0.5 h-4 w-4 shrink-0 rounded-[2px] border border-vein-lit bg-deepslate accent-torch disabled:opacity-50"
        />
        <span class="text-[13px] text-chalk">
          Flags GC optimisés (Aikar)
          <span class="mt-0.5 block text-[12px] text-ash-dim">
            Ne rend pas le serveur plus rapide : rend ses ticks plus réguliers, en
            échangeant des pauses rares et longues contre des pauses fréquentes et
            courtes. Perceptible sur un gros modpack, invisible sur un serveur léger.
          </span>
        </span>
      </label>

      <p
        v-if="isMinecraft && aikar && memoryMb < AIKAR_MIN_HEAP_MB"
        class="mt-2 rounded-block border border-torch-dim bg-torch-dim/15 px-3 py-2 text-[12px] text-torch"
      >
        Sous {{ gb(AIKAR_MIN_HEAP_MB) }} Go de tas, ces flags nuisent plutôt qu'ils
        n'aident : ils agrandissent la jeune génération, ce qui laisse une vieille
        génération trop étroite et multiplie les collectes.
      </p>

      <p v-if="!stopped" class="mt-3 text-[12px] text-ash-dim">
        Arrête le serveur pour modifier ces valeurs : le conteneur doit être refait.
      </p>

      <UiBtn
        variant="primary"
        class="mt-3"
        :disabled="busy || !stopped || !resourcesDirty"
        @click="saveResources"
      >
        Appliquer
      </UiBtn>
    </section>

    <!-- Clonage -->
    <section class="rounded-slab border border-vein bg-stone/30 p-4">
      <h3 class="eyebrow">Dupliquer ce serveur</h3>
      <p class="mt-1.5 text-[13px] text-ash">
        Pour éprouver une mise à jour sans risquer le serveur principal.
      </p>
      <div class="mt-3 grid max-w-lg gap-4 sm:grid-cols-2">
        <UiField v-model="cloneName" label="Nom de la copie" placeholder="essai mise à jour" />
        <UiField v-model.number="clonePort" label="Port" type="number" mono />
      </div>
      <label class="mt-3 flex items-start gap-2.5">
        <input
          v-model="cloneWorld"
          type="checkbox"
          class="mt-0.5 h-4 w-4 shrink-0 rounded-[2px] border border-vein-lit bg-deepslate accent-torch"
        />
        <span class="text-[13px] text-chalk">
          Copier aussi le monde
          <span class="mt-0.5 block text-[12px] text-ash-dim">
            Sans ça, la copie démarre sur une carte vierge — et le clonage est
            bien plus rapide.
          </span>
        </span>
      </label>
      <UiBtn class="mt-3" :disabled="busy || !cloneName.trim()" @click="clone">
        Dupliquer
      </UiBtn>
    </section>

    <!-- Nouveau monde -->
    <section class="rounded-slab border border-redstone-dim/60 bg-redstone-dim/5 p-4">
      <h3 class="eyebrow">Repartir sur un nouveau monde</h3>
      <p class="mt-1.5 text-[13px] text-ash">
        Efface la carte en gardant les mods et la configuration. Le serveur en
        génère une nouvelle au démarrage suivant.
      </p>
      <div class="mt-3 grid max-w-lg gap-4 sm:grid-cols-2">
        <UiField v-model="seed" label="Graine (facultatif)" mono hint="Vide = aléatoire." />
        <UiField v-model="confirmName" label="Retape le nom du serveur" :placeholder="server.name" mono />
      </div>
      <p class="mt-3 text-[12px] text-ash-dim">
        Fais une sauvegarde d'abord : un monde effacé ne se récupère pas.
      </p>
      <UiBtn
        variant="danger"
        class="mt-3"
        :disabled="busy || confirmName.trim() !== server.name"
        @click="resetWorld"
      >
        Effacer le monde
      </UiBtn>
    </section>
  </div>
</template>
