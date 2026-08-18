<script setup lang="ts">
const props = defineProps<{ serverId: string }>()

interface FileEntry {
  name: string
  path: string
  isDir: boolean
  size: number
  modified: number
  editable: boolean
}

const path = ref('')
const entries = ref<FileEntry[]>([])
const loading = ref(false)
const error = ref<string | null>(null)

/** Fichier ouvert dans l'éditeur, s'il y en a un. */
const editing = ref<{ path: string; content: string; original: string } | null>(null)
const saving = ref(false)
const notice = ref<{ text: string; ok: boolean } | null>(null)

/** Fil d'Ariane : chaque segment est cliquable pour remonter d'un niveau. */
const crumbs = computed(() => {
  const parts = path.value.split('/').filter(Boolean)
  return parts.map((name, i) => ({ name, path: parts.slice(0, i + 1).join('/') }))
})

async function open(next: string) {
  loading.value = true
  error.value = null
  try {
    const res = await $fetch(`/api/servers/${props.serverId}/files`, {
      query: { path: next },
    })
    entries.value = res.entries ?? []
    path.value = next
    editing.value = null
  } catch (e: any) {
    error.value = e?.data?.statusMessage ?? "Ce dossier n'a pas pu être lu."
  } finally {
    loading.value = false
  }
}

async function openFile(entry: FileEntry) {
  if (entry.isDir) return open(entry.path)
  if (!entry.editable) {
    notice.value = { text: 'Ce type de fichier ne s’ouvre pas ici.', ok: false }
    return
  }
  loading.value = true
  notice.value = null
  try {
    const res = await $fetch(`/api/servers/${props.serverId}/files`, {
      query: { path: entry.path, read: 'true' },
    })
    editing.value = { path: entry.path, content: res.content!, original: res.content! }
  } catch (e: any) {
    error.value = e?.data?.statusMessage ?? "Ce fichier n'a pas pu être ouvert."
  } finally {
    loading.value = false
  }
}

const dirty = computed(
  () => editing.value !== null && editing.value.content !== editing.value.original,
)

async function save() {
  if (!editing.value || !dirty.value) return
  saving.value = true
  notice.value = null
  try {
    await $fetch(`/api/servers/${props.serverId}/files`, {
      method: 'PUT',
      body: { path: editing.value.path, content: editing.value.content },
    })
    editing.value.original = editing.value.content
    notice.value = {
      text: 'Enregistré. Redémarre le serveur pour appliquer les changements.',
      ok: true,
    }
  } catch (e: any) {
    notice.value = { text: e?.data?.statusMessage ?? "L'enregistrement a échoué.", ok: false }
  } finally {
    saving.value = false
  }
}

async function remove(entry: FileEntry) {
  if (!globalThis.confirm(`Supprimer « ${entry.name} » ? C'est définitif.`)) return
  try {
    await $fetch(`/api/servers/${props.serverId}/files`, {
      method: 'DELETE',
      query: { path: entry.path },
    })
    await open(path.value)
  } catch (e: any) {
    notice.value = { text: e?.data?.statusMessage ?? 'La suppression a échoué.', ok: false }
  }
}

/* -- Envoi de fichiers --------------------------------------------------- */

const uploading = ref(false)
const dragging = ref(false)
const fileInput = ref<HTMLInputElement | null>(null)

async function upload(list: FileList | null) {
  if (!list?.length) return
  uploading.value = true
  notice.value = null
  try {
    const form = new FormData()
    form.append('path', path.value)
    for (const f of list) form.append('files', f)

    const res = await $fetch<{ written: string[] }>(
      `/api/servers/${props.serverId}/upload`,
      { method: 'POST', body: form },
    )
    notice.value = {
      text:
        res.written.length === 1
          ? `« ${res.written[0]} » envoyé. Redémarre le serveur pour le prendre en compte.`
          : `${res.written.length} fichiers envoyés. Redémarre le serveur pour les prendre en compte.`,
      ok: true,
    }
    await open(path.value)
  } catch (e: any) {
    notice.value = { text: e?.data?.statusMessage ?? "L'envoi a échoué.", ok: false }
  } finally {
    uploading.value = false
    if (fileInput.value) fileInput.value.value = ''
  }
}

/** Une archive déposée se décompresse sur place : c'est ce qui rend l'envoi
 *  utile pour un monde entier plutôt que fichier par fichier. */
const isArchive = (name: string) => /\.(zip|tar|tar\.gz|tgz)$/i.test(name)

async function extract(entry: FileEntry) {
  notice.value = null
  try {
    await $fetch(`/api/servers/${props.serverId}/extract`, {
      method: 'POST',
      body: { path: entry.path },
    })
    notice.value = { text: `« ${entry.name} » a été décompressée ici.`, ok: true }
    await open(path.value)
  } catch (e: any) {
    notice.value = { text: e?.data?.statusMessage ?? 'La décompression a échoué.', ok: false }
  }
}

function downloadUrl(p: string) {
  return `/api/servers/${props.serverId}/download?path=${encodeURIComponent(p)}`
}

function onDrop(e: DragEvent) {
  dragging.value = false
  upload(e.dataTransfer?.files ?? null)
}

const size = (n: number) =>
  n >= 1048576
    ? `${(n / 1048576).toFixed(1).replace('.', ',')} Mo`
    : n >= 1024
      ? `${Math.round(n / 1024)} Ko`
      : `${n} o`

onMounted(() => open(''))
</script>

<template>
  <div>
    <!-- Fil d'Ariane : on doit toujours savoir où on est -->
    <div class="flex flex-wrap items-center gap-1 font-mono text-[12px]">
      <button type="button" class="text-ash hover:text-torch" @click="open('')">
        {{ serverId }}
      </button>
      <template v-for="c in crumbs" :key="c.path">
        <span class="text-vein-lit">/</span>
        <button type="button" class="text-ash hover:text-torch" @click="open(c.path)">
          {{ c.name }}
        </button>
      </template>
    </div>

    <p
      v-if="notice"
      role="status"
      class="mt-3 rounded-block border px-3 py-2 text-[12px]"
      :class="
        notice.ok
          ? 'border-torch-dim bg-torch-dim/20 text-torch'
          : 'border-redstone-dim bg-redstone-dim/20 text-redstone'
      "
    >
      {{ notice.text }}
    </p>

    <p
      v-if="error"
      role="alert"
      class="mt-3 rounded-block border border-redstone-dim bg-redstone-dim/20 px-3 py-2 text-[12px] text-redstone"
    >
      {{ error }}
    </p>

    <!-- Éditeur -->
    <div v-if="editing" class="mt-3 rounded-slab border border-vein">
      <div class="flex flex-wrap items-center justify-between gap-2 border-b border-vein px-3 py-2">
        <span class="truncate font-mono text-[12px] text-chalk">{{ editing.path }}</span>
        <div class="flex items-center gap-2">
          <span v-if="dirty" class="font-mono text-[11px] text-torch">non enregistré</span>
          <UiBtn size="sm" variant="ghost" @click="editing = null">Fermer</UiBtn>
          <UiBtn size="sm" variant="primary" :disabled="!dirty || saving" @click="save">
            {{ saving ? 'Enregistrement…' : 'Enregistrer' }}
          </UiBtn>
        </div>
      </div>
      <textarea
        v-model="editing.content"
        spellcheck="false"
        aria-label="Contenu du fichier"
        class="h-[26rem] w-full resize-y bg-deepslate p-3 font-mono text-[12px] leading-relaxed text-chalk focus:outline-none"
      />
    </div>

    <!-- Dépôt : le glisser-déposer est le geste attendu, le bouton reste
         là pour ceux qui préfèrent, et pour l'accessibilité au clavier. -->
    <div
      v-if="!editing"
      class="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-slab border border-dashed px-4 py-3 transition-colors"
      :class="dragging ? 'border-torch bg-torch-dim/10' : 'border-vein'"
      @dragover.prevent="dragging = true"
      @dragleave.prevent="dragging = false"
      @drop.prevent="onDrop"
    >
      <p class="text-[13px] text-ash">
        {{
          uploading
            ? 'Envoi en cours…'
            : dragging
              ? 'Relâche pour envoyer ici'
              : 'Glisse des fichiers ici pour les ajouter à ce dossier.'
        }}
      </p>
      <input
        ref="fileInput"
        type="file"
        multiple
        class="hidden"
        @change="upload(($event.target as HTMLInputElement).files)"
      />
      <UiBtn size="sm" :disabled="uploading" @click="fileInput?.click()">
        Choisir des fichiers
      </UiBtn>
    </div>

    <!-- Listing -->
    <div v-if="!editing" class="mt-3 overflow-hidden rounded-slab border border-vein">
      <p v-if="loading" class="px-4 py-10 text-center text-[13px] text-ash-dim">Lecture…</p>
      <p v-else-if="!entries.length" class="px-4 py-10 text-center text-[13px] text-ash-dim">
        Ce dossier est vide.
      </p>

      <div v-else class="max-h-[30rem] overflow-y-auto">
        <div
          v-for="e in entries"
          :key="e.path"
          class="group flex items-center gap-3 border-b border-vein px-3 py-2 last:border-b-0 hover:bg-stone/50"
        >
          <button
            type="button"
            class="flex min-w-0 flex-1 items-center gap-2.5 text-left"
            @click="openFile(e)"
          >
            <NavIcon
              :name="e.isDir ? 'files' : 'config'"
              class="h-4 w-4 shrink-0"
              :class="e.isDir ? 'text-torch' : 'text-ash-dim'"
            />
            <span class="truncate font-mono text-[12px] text-chalk">{{ e.name }}</span>
            <span v-if="!e.isDir" class="shrink-0 font-mono text-[11px] text-ash-dim">
              {{ size(e.size) }}
            </span>
          </button>

          <span class="hidden shrink-0 font-mono text-[11px] text-ash-dim sm:block">
            {{ new Date(e.modified).toLocaleDateString('fr-FR') }}
          </span>

          <div class="flex shrink-0 gap-3 opacity-0 transition-opacity group-hover:opacity-100">
            <button
              v-if="!e.isDir && isArchive(e.name)"
              type="button"
              class="text-[11px] text-ash-dim hover:text-torch"
              @click="extract(e)"
            >
              Décompresser
            </button>
            <a
              :href="downloadUrl(e.path)"
              download
              class="text-[11px] text-ash-dim hover:text-chalk"
              :title="e.isDir ? 'Télécharger en archive' : 'Télécharger'"
            >
              Télécharger
            </a>
            <button
              type="button"
              class="text-[11px] text-ash-dim hover:text-redstone"
              @click="remove(e)"
            >
              Supprimer
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
