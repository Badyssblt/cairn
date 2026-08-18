<script setup lang="ts">
const props = defineProps<{ serverId: string; state: string }>()

interface Item {
  id: string
  projectId?: string
  title: string
  description: string
  downloads: number
  iconUrl: string | null
  author?: string | null
}
interface Installed {
  filename: string
  sizeMb: number
  disabled: boolean
  projectId?: string
}
interface Payload {
  supported: boolean
  reason?: string
  kind?: string
  filter?: string
  installed: Installed[]
  catalog: { kind: string; filter: string; items: Item[]; total: number } | null
  error?: string | null
}

const query = ref('')
/** La frappe ne doit pas déclencher une requête par caractère. */
const debounced = ref('')
let timer: ReturnType<typeof setTimeout> | undefined
watch(query, (v) => {
  clearTimeout(timer)
  timer = setTimeout(() => (debounced.value = v), 300)
})

const { data, pending, refresh } = await useFetch<Payload>(
  () => `/api/servers/${props.serverId}/content`,
  { query: { q: debounced } },
)

/* -- Actions --------------------------------------------------------------- */

/** Filtre local de l'inventaire — sans appel réseau, la liste est déjà là. */
const installedFilter = ref('')
const visibleInstalled = computed(() => {
  const q = installedFilter.value.trim().toLowerCase()
  const list = data.value?.installed ?? []
  return q ? list.filter((f) => f.filename.toLowerCase().includes(q)) : list
})

const busy = ref<string | null>(null)
const message = ref<{ tone: 'good' | 'bad'; text: string } | null>(null)

/**
 * Ce qui est déjà posé.
 *
 * Le rapprochement se fait sur l'identifiant du projet, obtenu en reconnaissant
 * chaque fichier à son empreinte. Comparer les noms ne marchait pas : le projet
 * « ferrite-core » s'installe sous le nom « ferritecore-7.0.2-neoforge.jar ».
 */
const installedProjects = computed(
  () =>
    new Set(
      (data.value?.installed ?? [])
        .map((f) => f.projectId)
        .filter((p): p is string => Boolean(p)),
    ),
)

const isInstalled = (item: Item) =>
  Boolean(item.projectId && installedProjects.value.has(item.projectId))

async function install(item: Item) {
  busy.value = item.id
  message.value = null
  try {
    const res = await $fetch<{ filename: string; version: string }>(
      `/api/servers/${props.serverId}/content`,
      { method: 'POST', body: { project: item.id } },
    )
    message.value = {
      tone: 'good',
      text: `${item.title} ${res.version} installé. Redémarre le serveur pour qu'il soit chargé.`,
    }
    await refresh()
  } catch (e: any) {
    message.value = { tone: 'bad', text: e.data?.statusMessage ?? "Installation impossible." }
  } finally {
    busy.value = null
  }
}

async function remove(file: Installed) {
  if (!confirm(`Supprimer ${file.filename} ?`)) return
  busy.value = file.filename
  message.value = null
  try {
    await $fetch(`/api/servers/${props.serverId}/content`, {
      method: 'DELETE',
      body: { filename: file.filename },
    })
    message.value = {
      tone: 'good',
      text: `${file.filename} supprimé. Redémarre le serveur pour appliquer.`,
    }
    await refresh()
  } catch (e: any) {
    message.value = { tone: 'bad', text: e.data?.statusMessage ?? 'Suppression impossible.' }
  } finally {
    busy.value = null
  }
}

const fmt = (n: number) =>
  n >= 1_000_000
    ? `${(n / 1_000_000).toFixed(1)} M`
    : n >= 1000
      ? `${Math.round(n / 1000)} k`
      : String(n)
</script>

<template>
  <div v-if="data" class="space-y-6">
    <!-- Serveur qui ne charge rien : on explique pourquoi et où ça se passe
         vraiment, plutôt que d'afficher une recherche qui ne servirait à rien. -->
    <div
      v-if="!data.supported"
      class="rounded-slab border border-vein bg-stone/30 p-5"
    >
      <p class="text-[13px] text-ash">{{ data.reason }}</p>
    </div>

    <template v-else>
      <p
        v-if="message"
        class="rounded-block border px-3 py-2 text-[13px]"
        :class="
          message.tone === 'good'
            ? 'border-moss-dim bg-moss-dim/15 text-moss'
            : 'border-redstone-dim bg-redstone-dim/15 text-redstone'
        "
      >
        {{ message.text }}
      </p>

      <!-- Le catalogue ---------------------------------------------------- -->
      <section>
        <div class="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <h3 class="eyebrow">Ajouter</h3>
          <!-- Le filtre est affiché, pas seulement appliqué : on doit pouvoir
               constater que la liste est bien restreinte au serveur. -->
          <p class="font-mono text-[11px] text-ash-dim">
            compatible {{ data.filter }}
          </p>
        </div>

        <input
          v-model="query"
          type="search"
          :placeholder="
            data.kind === 'plugins' ? 'Chercher un plugin…' : 'Chercher un mod…'
          "
          class="mt-3 w-full rounded-block border border-vein bg-deepslate px-3 py-2 text-[13px] text-chalk placeholder:text-ash-dim focus:border-torch focus:outline-none"
        />

        <p v-if="data.error" class="mt-3 text-[13px] text-redstone">
          {{ data.error }}
        </p>

        <p v-else-if="pending" class="mt-3 text-[13px] text-ash-dim">Recherche…</p>

        <p
          v-else-if="!data.catalog?.items.length"
          class="mt-3 text-[13px] text-ash-dim"
        >
          Rien ne correspond pour {{ data.filter }}.
        </p>

        <ul v-else class="mt-3 space-y-2">
          <li
            v-for="item in data.catalog.items"
            :key="item.id"
            class="flex items-start gap-3 rounded-slab border border-vein bg-stone/30 p-3"
          >
            <img
              v-if="item.iconUrl"
              :src="item.iconUrl"
              alt=""
              width="40"
              height="40"
              loading="lazy"
              class="size-10 shrink-0 rounded-block bg-deepslate object-cover"
            />
            <div v-else class="size-10 shrink-0 rounded-block bg-vein" />

            <div class="min-w-0 flex-1">
              <p class="truncate text-[13px] text-chalk">{{ item.title }}</p>
              <p class="mt-0.5 line-clamp-2 text-[12px] leading-snug text-ash">
                {{ item.description }}
              </p>
              <p class="mt-1 font-mono text-[11px] text-ash-dim">
                {{ fmt(item.downloads) }} téléchargements
                <template v-if="item.author"> · {{ item.author }}</template>
              </p>
            </div>

            <UiBtn
              size="sm"
              class="shrink-0"
              :disabled="busy === item.id || isInstalled(item)"
              @click="install(item)"
            >
              {{
                isInstalled(item)
                  ? 'En place'
                  : busy === item.id
                    ? 'Installation…'
                    : 'Installer'
              }}
            </UiBtn>
          </li>
        </ul>
      </section>


      <!-- Ce qui est en place -------------------------------------------- -->
      <section>
        <div class="flex items-baseline justify-between gap-3">
          <h3 class="eyebrow">
            {{ data.kind === 'plugins' ? 'Plugins installés' : 'Mods installés' }}
          </h3>
          <span class="font-mono text-[11px] text-ash-dim">
            {{ data.installed.length }}
          </span>
        </div>

        <p v-if="!data.installed.length" class="mt-2 text-[13px] text-ash-dim">
          Rien pour l'instant. Utilise la recherche ci-dessus pour en ajouter.
        </p>

        <template v-else>
          <!-- Un modpack en compte plusieurs dizaines : sans filtre, retrouver
               un fichier précis revient à lire toute la liste. -->
          <input
            v-if="data.installed.length > 12"
            v-model="installedFilter"
            type="search"
            placeholder="Filtrer les fichiers installés…"
            class="mt-3 w-full rounded-block border border-vein bg-deepslate px-3 py-2 text-[13px] text-chalk placeholder:text-ash-dim focus:border-torch focus:outline-none"
          />

          <p
            v-if="!visibleInstalled.length"
            class="mt-3 text-[13px] text-ash-dim"
          >
            Aucun fichier ne correspond.
          </p>

          <!-- Hauteur bornée : la liste défile chez elle et ne repousse pas le
               reste de la page hors de l'écran. -->
          <ul
            v-else
            class="mt-3 max-h-96 divide-y divide-vein overflow-y-auto rounded-slab border border-vein"
          >
            <li
              v-for="f in visibleInstalled"
              :key="f.filename"
              class="flex items-center gap-3 px-3 py-2"
            >
              <span class="min-w-0 flex-1 truncate font-mono text-[12px] text-chalk">
                {{ f.filename }}
              </span>
              <span class="shrink-0 font-mono text-[11px] text-ash-dim">
                {{ f.sizeMb }} Mo
              </span>
              <button
                type="button"
                class="shrink-0 text-[12px] text-ash-dim transition-colors hover:text-redstone disabled:opacity-40"
                :disabled="busy === f.filename"
                @click="remove(f)"
              >
                Supprimer
              </button>
            </li>
          </ul>
        </template>
      </section>

      <p v-if="state === 'running'" class="text-[12px] text-ash-dim">
        Le serveur tourne : les ajouts et suppressions ne prendront effet qu'au
        prochain redémarrage.
      </p>
    </template>
  </div>
</template>
