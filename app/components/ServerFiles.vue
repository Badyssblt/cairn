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

/**
 * Configs de plugins/mods (YAML, TOML, JSON) : un formulaire généré depuis
 * les clés du fichier plutôt que le texte brut. Pas de schéma connu d'avance
 * (contrairement à server.properties), donc pas de libellés — juste des
 * champs typés. `structured` reste `null` pour les fichiers sans format
 * reconnu, ou dont le contenu ne s'est pas laissé analyser.
 */
const structured = ref<ReturnType<typeof parseStructuredConfig> | null>(null)
const structuredDraft = ref<unknown>(null)
const viewMode = ref<'form' | 'text'>('text')

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
    closeEditor()
  } catch (e: any) {
    error.value = e?.data?.statusMessage ?? "Ce dossier n'a pas pu être lu."
  } finally {
    loading.value = false
  }
}

function closeEditor() {
  editing.value = null
  structured.value = null
  structuredDraft.value = null
  viewMode.value = 'text'
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
    openStructured(entry.path, res.content!)
  } catch (e: any) {
    error.value = e?.data?.statusMessage ?? "Ce fichier n'a pas pu être ouvert."
  } finally {
    loading.value = false
  }
}

/** Tente le formulaire pour ce fichier ; repli silencieux sur le texte brut. */
function openStructured(path: string, content: string) {
  structured.value = null
  const format = detectStructuredFormat(path)
  if (!format) {
    viewMode.value = 'text'
    return
  }
  try {
    structured.value = parseStructuredConfig(format, content)
    structuredDraft.value = structured.value.draft
    viewMode.value = 'form'
  } catch {
    viewMode.value = 'text'
    notice.value = { text: `${format.toUpperCase()} illisible : ouvert en texte.`, ok: false }
  }
}

/**
 * Passer du formulaire au texte fige les modifications en cours dans le
 * texte affiché ; l'inverse relit ce texte, au cas où il aurait été retouché
 * à la main entretemps.
 */
function setViewMode(mode: 'form' | 'text') {
  if (!editing.value) return
  if (mode === 'text' && viewMode.value === 'form' && structured.value) {
    editing.value.content = structured.value.serialize(structuredDraft.value)
  }
  if (mode === 'form') {
    const format = detectStructuredFormat(editing.value.path)
    if (format) {
      try {
        structured.value = parseStructuredConfig(format, editing.value.content)
        structuredDraft.value = structured.value.draft
      } catch {
        notice.value = { text: 'Texte non analysable : corrige-le avant de repasser au formulaire.', ok: false }
        return
      }
    }
  }
  viewMode.value = mode
}

const dirty = computed(() => {
  if (!editing.value) return false
  if (viewMode.value === 'form' && structured.value) {
    return JSON.stringify(structuredDraft.value) !== JSON.stringify(structured.value.draft)
  }
  return editing.value.content !== editing.value.original
})

async function save() {
  if (!editing.value || !dirty.value) return
  saving.value = true
  notice.value = null
  try {
    const content =
      viewMode.value === 'form' && structured.value
        ? structured.value.serialize(structuredDraft.value)
        : editing.value.content

    await $fetch(`/api/servers/${props.serverId}/files`, {
      method: 'PUT',
      body: { path: editing.value.path, content },
    })
    editing.value.content = content
    editing.value.original = content
    // Repart du texte tel qu'enregistré : le formulaire et le texte restent
    // d'accord sur ce qui est réellement sur disque.
    openStructured(editing.value.path, content)
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

/** Un fichier à envoyer, avec son chemin relatif au dossier déposé. */
interface DroppedFile {
  file: File
  relPath: string
}

async function upload(items: DroppedFile[]) {
  if (!items.length) return
  uploading.value = true
  notice.value = null
  try {
    const form = new FormData()
    form.append('path', path.value)
    // Le troisième argument fixe le nom transmis au serveur : c'est lui qui
    // porte le chemin relatif (`sous-dossier/fichier.txt`) quand l'envoi
    // vient d'un dossier glissé, plutôt que le seul nom du fichier.
    for (const { file, relPath } of items) form.append('files', file, relPath)

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

function uploadFileList(list: FileList | null) {
  if (!list?.length) return
  return upload([...list].map((file) => ({ file, relPath: file.name })))
}

/**
 * Traverse un dossier déposé pour en récupérer chaque fichier avec son
 * chemin relatif — l'API `DataTransferItem.webkitGetAsEntry` est le seul
 * moyen dont dispose le navigateur pour distinguer un dossier glissé d'un
 * fichier, `dataTransfer.files` les traitant tous deux comme des fichiers.
 */
function readEntry(entry: FileSystemEntry, prefix: string): Promise<DroppedFile[]> {
  if (entry.isFile) {
    return new Promise((res, rej) => {
      ;(entry as FileSystemFileEntry).file(
        (file) => res([{ file, relPath: prefix + entry.name }]),
        rej,
      )
    })
  }

  const reader = (entry as FileSystemDirectoryEntry).createReader()
  const readBatch = (): Promise<FileSystemEntry[]> =>
    new Promise((res, rej) => reader.readEntries(res, rej))

  return (async () => {
    const children: FileSystemEntry[] = []
    // `readEntries` ne rend qu'un lot à la fois (100 en général) : il faut
    // le rappeler jusqu'à ce qu'il rende un tableau vide.
    for (let batch = await readBatch(); batch.length; batch = await readBatch()) {
      children.push(...batch)
    }
    const nested = await Promise.all(children.map((c) => readEntry(c, `${prefix}${entry.name}/`)))
    return nested.flat()
  })()
}

async function collectDropped(dt: DataTransfer): Promise<DroppedFile[]> {
  const items = dt.items
  if (!items?.length) return [...(dt.files ?? [])].map((file) => ({ file, relPath: file.name }))

  const entries = [...items]
    .map((it) => it.webkitGetAsEntry?.())
    .filter((e): e is FileSystemEntry => Boolean(e))

  // Navigateur sans `webkitGetAsEntry` : on retombe sur la liste plate, qui
  // ne sait envoyer que des fichiers isolés.
  if (!entries.length) return [...(dt.files ?? [])].map((file) => ({ file, relPath: file.name }))

  const nested = await Promise.all(entries.map((e) => readEntry(e, '')))
  return nested.flat()
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

async function onDrop(e: DragEvent) {
  dragging.value = false
  if (!e.dataTransfer) return
  await upload(await collectDropped(e.dataTransfer))
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
          <div v-if="structured" class="flex overflow-hidden rounded-block border border-vein">
            <button
              type="button"
              class="px-2.5 py-1 text-[11px]"
              :class="viewMode === 'form' ? 'bg-torch-dim/20 text-torch' : 'text-ash-dim hover:text-chalk'"
              @click="setViewMode('form')"
            >
              Formulaire
            </button>
            <button
              type="button"
              class="border-l border-vein px-2.5 py-1 text-[11px]"
              :class="viewMode === 'text' ? 'bg-torch-dim/20 text-torch' : 'text-ash-dim hover:text-chalk'"
              @click="setViewMode('text')"
            >
              Texte
            </button>
          </div>
          <span v-if="dirty" class="font-mono text-[11px] text-torch">non enregistré</span>
          <UiBtn size="sm" variant="ghost" @click="closeEditor">Fermer</UiBtn>
          <UiBtn size="sm" variant="primary" :disabled="!dirty || saving" @click="save">
            {{ saving ? 'Enregistrement…' : 'Enregistrer' }}
          </UiBtn>
        </div>
      </div>

      <div v-if="viewMode === 'form' && structured" class="max-h-[30rem] overflow-y-auto p-3">
        <StructuredValue v-model="structuredDraft" />
      </div>
      <CodeEditor v-else v-model="editing.content" :path="editing.path" />
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
              : 'Glisse des fichiers ou des dossiers ici pour les ajouter à ce dossier.'
        }}
      </p>
      <input
        ref="fileInput"
        type="file"
        multiple
        class="hidden"
        @change="uploadFileList(($event.target as HTMLInputElement).files)"
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
