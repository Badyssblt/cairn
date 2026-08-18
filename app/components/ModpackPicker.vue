<script setup lang="ts">
/**
 * Navigateur de modpacks.
 *
 * En grille avec de vraies vignettes : un modpack se choisit d'abord à l'œil,
 * sur son univers et son ambiance. Une liste de lignes à petites icônes oblige
 * à lire pour reconnaître, ce qui est le contraire de parcourir un catalogue.
 */
export interface ModpackSelection {
  source: 'MODRINTH' | 'CURSEFORGE'
  project: string
  version: string | null
  loader: string | null
  name: string
  iconUrl: string | null
}

const selection = defineModel<ModpackSelection | null>()

const SOURCES = [
  { key: 'CURSEFORGE' as const, label: 'CurseForge' },
  { key: 'MODRINTH' as const, label: 'Modrinth' },
]
const source = ref<'MODRINTH' | 'CURSEFORGE'>('CURSEFORGE')

interface Entry {
  key: string
  title: string
  description: string
  iconUrl: string | null
  meta: string
}
interface VersionEntry {
  key: string
  label: string
  meta: string
  loader: string | null
}

const query = ref('')
const entries = ref<Entry[]>([])
const searching = ref(false)
const error = ref<string | null>(null)

const openEntry = ref<Entry | null>(null)
const versions = ref<VersionEntry[]>([])
const loadingVersions = ref(false)
const chosenVersion = ref<string>('')

const compact = (n: number) =>
  n >= 1e6 ? `${(n / 1e6).toFixed(1)} M` : n >= 1e3 ? `${Math.round(n / 1e3)} k` : String(n)

async function search() {
  searching.value = true
  error.value = null
  openEntry.value = null
  try {
    if (source.value === 'CURSEFORGE') {
      const res = await $fetch('/api/curseforge/search', { query: { q: query.value } })
      entries.value = res.modpacks.map((m) => ({
        key: String(m.id),
        title: m.name,
        description: m.description,
        iconUrl: m.iconUrl,
        meta: `${compact(m.installs)} joueurs`,
      }))
    } else {
      const res = await $fetch('/api/modrinth/search', { query: { q: query.value } })
      entries.value = res.modpacks.map((m) => ({
        key: m.slug,
        title: m.title,
        description: m.description,
        iconUrl: m.iconUrl,
        meta: `${compact(m.downloads)} joueurs`,
      }))
    }
  } catch (e: any) {
    error.value = e?.data?.statusMessage ?? "La recherche n'a rien pu récupérer."
    entries.value = []
  } finally {
    searching.value = false
  }
}

async function choose(entry: Entry) {
  openEntry.value = entry
  loadingVersions.value = true
  versions.value = []
  chosenVersion.value = ''
  try {
    if (source.value === 'CURSEFORGE') {
      const res = await $fetch(`/api/curseforge/${entry.key}/versions`)
      versions.value = res.versions.map((v) => ({
        key: String(v.id),
        label: v.name,
        meta:
          (v.type !== 'release' ? `${v.type} · ` : '') +
          new Date(v.updated).toLocaleDateString('fr-FR'),
        loader: null,
      }))
    } else {
      const res = await $fetch(`/api/modrinth/${entry.key}/versions`)
      versions.value = res.versions.map((v) => ({
        key: v.id,
        label: v.versionNumber,
        meta: `Minecraft ${v.gameVersions.join(', ') || '—'}`,
        loader: v.loaders[0] ?? null,
      }))
    }
    // La plus récente est le choix attendu dans l'immense majorité des cas.
    chosenVersion.value = versions.value[0]?.key ?? ''
  } catch (e: any) {
    error.value = e?.data?.statusMessage ?? "Les versions n'ont pas pu être lues."
  } finally {
    loadingVersions.value = false
  }
}

function confirm() {
  const v = versions.value.find((x) => x.key === chosenVersion.value)
  if (!openEntry.value || !v) return
  selection.value = {
    source: source.value,
    project: openEntry.value.key,
    version: v.key,
    loader: v.loader,
    name: openEntry.value.title,
    iconUrl: openEntry.value.iconUrl,
  }
  openEntry.value = null
}

function clear() {
  selection.value = null
  openEntry.value = null
  versions.value = []
}

function switchSource(key: 'MODRINTH' | 'CURSEFORGE') {
  if (source.value === key) return
  source.value = key
  entries.value = []
  search()
}

const chosenVersionLabel = computed(
  () => versions.value.find((v) => v.key === chosenVersion.value)?.label ?? '',
)

onMounted(search)
</script>

<template>
  <div>
    <!-- Choix fait : on montre ce qui a été retenu, pas le catalogue -->
    <div
      v-if="selection"
      class="flex items-center gap-3 rounded-slab border border-torch-dim bg-torch-dim/10 p-3"
    >
      <img
        v-if="selection.iconUrl"
        :src="selection.iconUrl"
        alt=""
        class="h-14 w-14 shrink-0 rounded-block object-cover"
      />
      <div class="min-w-0 flex-1">
        <p class="truncate text-[14px] text-chalk">{{ selection.name }}</p>
        <p class="mt-0.5 font-mono text-[11px] text-ash-dim">
          {{ selection.source === 'CURSEFORGE' ? 'CurseForge' : 'Modrinth' }}
        </p>
      </div>
      <UiBtn size="sm" @click="clear">Changer</UiBtn>
    </div>

    <template v-else>
      <!-- Barre de recherche et catalogue, sur une seule ligne -->
      <div class="flex flex-wrap items-center gap-2">
        <div class="flex rounded-block border border-vein p-0.5">
          <button
            v-for="s in SOURCES"
            :key="s.key"
            type="button"
            class="rounded-[3px] px-3 py-1 text-[12px] transition-colors"
            :class="
              source === s.key ? 'bg-torch text-deepslate font-semibold' : 'text-ash hover:text-chalk'
            "
            @click="switchSource(s.key)"
          >
            {{ s.label }}
          </button>
        </div>

        <form class="flex min-w-[220px] flex-1 gap-2" @submit.prevent="search">
          <input
            v-model="query"
            placeholder="Chercher une aventure, un thème, un nom…"
            aria-label="Chercher un modpack"
            class="h-9 min-w-0 flex-1 rounded-block border border-vein bg-deepslate px-2.5 text-[13px] text-chalk placeholder:text-ash-dim/70 focus:border-torch focus:outline-none"
          />
          <UiBtn type="submit" :disabled="searching">Chercher</UiBtn>
        </form>
      </div>

      <p
        v-if="error"
        role="alert"
        class="mt-3 rounded-block border border-redstone-dim bg-redstone-dim/20 px-3 py-2 text-[12px] text-redstone"
      >
        {{ error }}
      </p>

      <!-- Étape 2 : la version, sur une fiche dédiée -->
      <div v-if="openEntry" class="mt-3 rounded-slab border border-vein bg-stone/30 p-4">
        <div class="flex items-start gap-3">
          <img
            v-if="openEntry.iconUrl"
            :src="openEntry.iconUrl"
            alt=""
            class="h-16 w-16 shrink-0 rounded-block object-cover"
          />
          <div class="min-w-0 flex-1">
            <p class="text-[14px] text-chalk">{{ openEntry.title }}</p>
            <p class="mt-0.5 line-clamp-2 text-[12px] text-ash">{{ openEntry.description }}</p>
          </div>
          <button
            type="button"
            class="shrink-0 text-[12px] text-ash hover:text-chalk"
            @click="openEntry = null"
          >
            Retour
          </button>
        </div>

        <div class="mt-4">
          <label for="pack-version" class="eyebrow block">Version du pack</label>
          <p v-if="loadingVersions" class="mt-2 text-[13px] text-ash-dim">
            Lecture des versions…
          </p>
          <p v-else-if="!versions.length" class="mt-2 text-[13px] text-ash-dim">
            Ce pack ne propose aucune version installable.
          </p>
          <select
            v-else
            id="pack-version"
            v-model="chosenVersion"
            class="mt-1.5 h-9 w-full rounded-block border border-vein bg-deepslate px-2.5 text-[13px] text-chalk focus:border-torch focus:outline-none"
          >
            <option v-for="v in versions" :key="v.key" :value="v.key">
              {{ v.label }} — {{ v.meta }}
            </option>
          </select>
        </div>

        <UiBtn
          variant="primary"
          class="mt-4 w-full"
          :disabled="!chosenVersion"
          @click="confirm"
        >
          Choisir {{ chosenVersionLabel }}
        </UiBtn>
      </div>

      <!-- Étape 1 : la grille -->
      <div v-else class="mt-3">
        <div v-if="searching" class="grid gap-2 sm:grid-cols-2">
          <div
            v-for="i in 6"
            :key="i"
            class="h-[86px] animate-pulse rounded-slab border border-vein bg-stone/40"
          />
        </div>

        <p
          v-else-if="!entries.length"
          class="rounded-slab border border-dashed border-vein px-5 py-10 text-center text-[13px] text-ash"
        >
          Aucun modpack ne correspond. Essaie un autre mot, ou change de catalogue.
        </p>

        <div v-else class="grid max-h-[26rem] gap-2 overflow-y-auto pr-1 sm:grid-cols-2">
          <button
            v-for="e in entries"
            :key="e.key"
            type="button"
            class="group flex min-h-[96px] items-start gap-3 rounded-slab border border-vein bg-stone/40 p-3 text-left transition-colors hover:border-torch hover:bg-stone-lit"
            @click="choose(e)"
          >
            <img
              v-if="e.iconUrl"
              :src="e.iconUrl"
              alt=""
              loading="lazy"
              class="h-14 w-14 shrink-0 rounded-block object-cover"
            />
            <span
              v-else
              class="grid h-14 w-14 shrink-0 place-items-center rounded-block bg-vein text-ash-dim"
            >
              <ServerTypeIcon type="MODPACK" class="h-6 w-6" />
            </span>

            <span class="min-w-0 flex-1">
              <span class="block truncate text-[13px] text-chalk group-hover:text-torch">
                {{ e.title }}
              </span>
              <span class="mt-0.5 line-clamp-2 text-[12px] leading-snug text-ash">
                {{ e.description }}
              </span>
              <span class="mt-1 block font-mono text-[11px] text-ash-dim">{{ e.meta }}</span>
            </span>
          </button>
        </div>
      </div>
    </template>
  </div>
</template>
