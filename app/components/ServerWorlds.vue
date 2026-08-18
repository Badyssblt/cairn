<script setup lang="ts">
const props = defineProps<{ serverId: string; state: string }>()

interface World {
  name: string
  active: boolean
  sizeMb: number
  dimensions: string[]
}

interface Datapack {
  name: string
  sizeMb: number
  packed: boolean
}

const { data, refresh } = await useFetch<{
  levelName: string
  worlds: World[]
  seed: string | null
  running: boolean
}>(() => `/api/servers/${props.serverId}/worlds`)

const { data: packs, refresh: refreshPacks } = await useFetch<{
  levelName: string
  datapacks: Datapack[]
  resourcePack: { url: string; sha1: string; required: boolean }
}>(() => `/api/servers/${props.serverId}/datapacks`)

const busy = ref(false)
const message = ref<{ text: string; ok: boolean } | null>(null)

const size = formatMb

async function run(fn: () => Promise<string>) {
  busy.value = true
  message.value = null
  try {
    message.value = { text: await fn(), ok: true }
  } catch (e: any) {
    message.value = { text: e?.data?.statusMessage ?? "L'opération a échoué.", ok: false }
  } finally {
    busy.value = false
  }
}

/* -- Mondes ---------------------------------------------------------------- */

/** Le téléchargement d'un dossier passe par la route de fichiers existante. */
function downloadWorld(name: string) {
  globalThis.location.href = `/api/servers/${props.serverId}/download?path=${encodeURIComponent(name)}`
}

function activate(name: string) {
  return run(async () => {
    await $fetch(`/api/servers/${props.serverId}/worlds/activate`, {
      method: 'POST',
      body: { name },
    })
    await refresh()
    await refreshPacks()
    return `« ${name} » sera chargé au prochain démarrage.`
  })
}

function backupWorld() {
  return run(async () => {
    await $fetch(`/api/servers/${props.serverId}/backups`, {
      method: 'POST',
      body: { scope: 'world', name: `Monde ${data.value?.levelName ?? ''}`.trim() },
    })
    return 'Sauvegarde du monde lancée. Elle apparaît dans l’onglet Sauvegardes.'
  })
}

/* -- Datapacks -------------------------------------------------------------- */

const dpInput = ref<HTMLInputElement | null>(null)

function uploadDatapacks(event: Event) {
  const files = (event.target as HTMLInputElement).files
  if (!files?.length) return

  return run(async () => {
    const body = new FormData()
    for (const f of files) body.append('files', f)

    const res = await $fetch<{ written: string[]; reloaded: boolean }>(
      `/api/servers/${props.serverId}/datapacks`,
      { method: 'POST', body },
    )
    if (dpInput.value) dpInput.value.value = ''
    await refreshPacks()

    return res.reloaded
      ? `${res.written.join(', ')} déposé et rechargé à chaud.`
      : `${res.written.join(', ')} déposé. Démarre le serveur pour l'activer.`
  })
}

function removeDatapack(name: string) {
  if (!globalThis.confirm(`Supprimer le datapack « ${name} » ?`)) return
  return run(async () => {
    await $fetch(`/api/servers/${props.serverId}/datapacks`, {
      method: 'DELETE',
      query: { name },
    })
    await refreshPacks()
    return `« ${name} » supprimé.`
  })
}

/* -- Pack de ressources ----------------------------------------------------- */

const packUrl = ref('')
const packRequired = ref(false)
watchEffect(() => {
  packUrl.value = packs.value?.resourcePack.url ?? ''
  packRequired.value = packs.value?.resourcePack.required ?? false
})

function saveResourcePack() {
  return run(async () => {
    const res = await $fetch<{ cleared: boolean; sha1?: string; sizeMb?: number }>(
      `/api/servers/${props.serverId}/resourcepack`,
      { method: 'POST', body: { url: packUrl.value.trim(), required: packRequired.value } },
    )
    await refreshPacks()
    return res.cleared
      ? 'Pack de ressources retiré.'
      : `Pack accepté (${res.sizeMb} Mo). Empreinte calculée : ${res.sha1?.slice(0, 12)}…`
  })
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

    <!-- Les mondes présents -->
    <section class="rounded-slab border border-vein bg-stone/30 p-4">
      <div class="flex flex-wrap items-baseline justify-between gap-3">
        <h3 class="eyebrow">Mondes sur ce serveur</h3>
        <span v-if="data?.seed" class="font-mono text-[11px] text-chalk">
          graine : {{ data.seed }}
        </span>
        <span v-else-if="data && !data.running" class="text-[11px] text-ash-dim">
          la graine se lit sur un serveur démarré
        </span>
      </div>

      <p v-if="!data?.worlds.length" class="mt-3 text-[13px] text-ash">
        Aucun monde généré pour l'instant. Démarre le serveur une fois : il crée
        sa carte au premier lancement.
      </p>

      <div v-else class="mt-3 space-y-1.5">
        <div
          v-for="w in data.worlds"
          :key="w.name"
          class="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-block border border-vein px-3 py-2"
          :class="w.active ? 'bg-torch-dim/10' : ''"
        >
          <div class="min-w-0 flex-1">
            <p class="truncate font-mono text-[12px] text-chalk">
              {{ w.name }}
              <span v-if="w.active" class="ml-1 text-[11px] text-torch">chargé</span>
            </p>
            <p v-if="w.dimensions.length" class="mt-0.5 font-mono text-[10px] text-ash-dim">
              avec {{ w.dimensions.join(', ') }}
            </p>
          </div>

          <span class="font-mono text-[11px] text-ash-dim">{{ size(w.sizeMb) }}</span>

          <div class="flex gap-1.5">
            <UiBtn size="sm" @click="downloadWorld(w.name)">Télécharger</UiBtn>
            <UiBtn
              v-if="!w.active"
              size="sm"
              :disabled="busy || state === 'running'"
              :title="state === 'running' ? 'Arrête le serveur pour changer de monde' : undefined"
              @click="activate(w.name)"
            >
              Charger celui-ci
            </UiBtn>
          </div>
        </div>
      </div>

      <div class="mt-3 flex flex-wrap items-center gap-3">
        <UiBtn :disabled="busy || !data?.worlds.length" @click="backupWorld">
          Sauvegarder le monde seul
        </UiBtn>
        <p class="text-[12px] text-ash-dim">
          Une fraction de la taille d'une archive complète, et la restaurer ne
          touche ni aux mods ni à la configuration.
        </p>
      </div>
    </section>

    <!-- Datapacks -->
    <section class="rounded-slab border border-vein bg-stone/30 p-4">
      <h3 class="eyebrow">Datapacks</h3>
      <p class="mt-1.5 text-[13px] text-ash">
        Déposés dans
        <span class="font-mono text-[12px] text-ash-dim">{{ packs?.levelName }}/datapacks</span>,
        puis rechargés à chaud si le serveur tourne. Un datapack posé ailleurs ne
        provoque aucune erreur : il est simplement ignoré.
      </p>

      <div v-if="packs?.datapacks.length" class="mt-3 space-y-1.5">
        <div
          v-for="d in packs.datapacks"
          :key="d.name"
          class="group flex items-center gap-3 rounded-block border border-vein px-3 py-2"
        >
          <span class="min-w-0 flex-1 truncate font-mono text-[12px] text-chalk">{{ d.name }}</span>
          <span class="font-mono text-[11px] text-ash-dim">{{ size(d.sizeMb) }}</span>
          <button
            type="button"
            class="text-[11px] text-ash-dim opacity-0 transition-opacity hover:text-redstone group-hover:opacity-100"
            :disabled="busy"
            @click="removeDatapack(d.name)"
          >
            Supprimer
          </button>
        </div>
      </div>
      <p v-else class="mt-3 text-[13px] text-ash-dim">Aucun datapack installé.</p>

      <label class="mt-3 inline-flex cursor-pointer items-center gap-2 text-[13px] text-chalk">
        <input
          ref="dpInput"
          type="file"
          accept=".zip"
          multiple
          class="block w-full text-[12px] text-ash file:mr-3 file:rounded-block file:border file:border-vein file:bg-stone/40 file:px-3 file:py-1.5 file:text-[12px] file:text-chalk hover:file:border-torch"
          :disabled="busy"
          @change="uploadDatapacks"
        />
      </label>
    </section>

    <!-- Pack de ressources -->
    <section class="rounded-slab border border-vein bg-stone/30 p-4">
      <h3 class="eyebrow">Pack de ressources</h3>
      <p class="mt-1.5 text-[13px] text-ash">
        Colle l'adresse directe du .zip : le panneau le télécharge une fois pour
        en calculer l'empreinte SHA-1, que Minecraft exige à côté de l'URL. Sans
        elle, le client le retélécharge à chaque connexion.
      </p>

      <div class="mt-3 max-w-2xl space-y-3">
        <UiField
          v-model="packUrl"
          label="Adresse du pack"
          placeholder="https://exemple.fr/pack.zip"
          mono
          hint="Vide = retirer le pack."
        />

        <p v-if="packs?.resourcePack.sha1" class="font-mono text-[11px] text-ash-dim">
          empreinte actuelle : {{ packs.resourcePack.sha1 }}
        </p>

        <label class="flex items-start gap-2.5">
          <input
            v-model="packRequired"
            type="checkbox"
            class="mt-0.5 h-4 w-4 shrink-0 rounded-[2px] border border-vein-lit bg-deepslate accent-torch"
          />
          <span class="text-[13px] text-chalk">
            Rendre le pack obligatoire
            <span class="mt-0.5 block text-[12px] text-ash-dim">
              Les joueurs qui le refusent sont déconnectés.
            </span>
          </span>
        </label>

        <UiBtn variant="primary" :disabled="busy" @click="saveResourcePack">
          {{ busy ? 'Vérification…' : 'Enregistrer le pack' }}
        </UiBtn>
      </div>
    </section>
  </div>
</template>
