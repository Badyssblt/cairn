<script setup lang="ts">
const props = defineProps<{ serverId: string }>()

interface Entry {
  key: string
  value: string
}

interface LgsmEntry {
  key: string
  value: string
  defaultValue: string
  overridden: boolean
}

interface PropertyMeta {
  key: string
  label: string
  hint: string
  kind: 'boolean' | 'select' | 'number' | 'text'
  options?: { value: string; label: string }[]
  min?: number
  max?: number
  group: string
  warnOn?: { value: string; message: string }
}

const { data, pending, refresh } = await useFetch<{
  supported: boolean
  game?: string
  format?: 'properties' | 'lgsm' | 'text'
  entries?: LgsmEntry[]
  path?: string
  properties?: Entry[]
  content?: string
  initialized?: boolean
  meta?: PropertyMeta[]
  groups?: { id: string; label: string }[]
}>(() => `/api/servers/${props.serverId}/properties`)

const isText = computed(() => data.value?.format === 'text')
const isLgsm = computed(() => data.value?.format === 'lgsm')

/**
 * Les deux formats à clés partagent le même formulaire : seule la source des
 * lignes change, et LinuxGSM y ajoute la valeur livrée en repère.
 */
const rows = computed(() =>
  isLgsm.value
    ? (data.value?.entries ?? []).map((e) => ({
        key: e.key,
        value: e.value,
        hint: e.defaultValue,
        overridden: e.overridden,
      }))
    : (data.value?.properties ?? []).map((p) => ({
        key: p.key,
        value: p.value,
        hint: null as string | null,
        overridden: false,
      })),
)

/** Copie de travail du fichier texte, pour les jeux hors Minecraft. */
const text = ref('')
const textOriginal = ref('')
watchEffect(() => {
  if (data.value?.format === 'text') {
    text.value = data.value.content ?? ''
    textOriginal.value = data.value.content ?? ''
  }
})
const textDirty = computed(() => text.value !== textOriginal.value)

async function saveText() {
  saving.value = true
  message.value = null
  try {
    await $fetch(`/api/servers/${props.serverId}/properties`, {
      method: 'PUT',
      body: { content: text.value },
    })
    textOriginal.value = text.value
    message.value = {
      text: 'Enregistré. Redémarre le serveur pour appliquer les changements.',
      ok: true,
    }
  } catch (e: any) {
    message.value = { text: e?.data?.statusMessage ?? "L'enregistrement a échoué.", ok: false }
  } finally {
    saving.value = false
  }
}

/** Copie de travail : on ne modifie rien tant que l'enregistrement n'a pas eu lieu. */
const draft = ref<Record<string, string>>({})
watchEffect(() => {
  draft.value = Object.fromEntries(rows.value.map((r) => [r.key, r.value]))
})

const dirty = computed(() => rows.value.filter((r) => draft.value[r.key] !== r.value))

const query = ref('')
const visible = computed(() => {
  const q = query.value.trim().toLowerCase()
  return q ? rows.value.filter((r) => r.key.toLowerCase().includes(q)) : rows.value
})

/* -- Les réglages qui comptent -------------------------------------------- */

/**
 * Les clés décrites sont sorties du lot et présentées en contrôles réels.
 *
 * On ne montre que celles réellement présentes dans le fichier : proposer un
 * réglage absent l'ajouterait à l'enregistrement, et une clé qu'on n'a pas
 * demandée qui apparaît dans server.properties est une surprise désagréable.
 */
const metaByKey = computed(
  () => new Map((data.value?.meta ?? []).map((m) => [m.key, m])),
)

const guidedGroups = computed(() => {
  if (data.value?.format !== 'properties') return []
  const present = new Set(rows.value.map((r) => r.key))

  return (data.value.groups ?? [])
    .map((g) => ({
      ...g,
      items: (data.value?.meta ?? []).filter((m) => m.group === g.id && present.has(m.key)),
    }))
    .filter((g) => g.items.length)
})

/** Le fichier entier reste accessible, mais replié : il fait soixante lignes. */
const showAll = ref(false)

const isTrue = (v: string | undefined) => String(v).trim().toLowerCase() === 'true'

/**
 * Les avertissements ne se déclenchent que sur la valeur *choisie maintenant*,
 * pas sur celle déjà enregistrée : rappeler à chaque affichage un risque déjà
 * accepté finirait par être ignoré, y compris le jour où il compte.
 */
const warnings = computed(() =>
  (data.value?.meta ?? [])
    .filter((m) => {
      if (!m.warnOn) return false
      const now = String(draft.value[m.key] ?? '').trim().toLowerCase()
      const before = String(rows.value.find((r) => r.key === m.key)?.value ?? '')
        .trim()
        .toLowerCase()
      return now === m.warnOn.value && before !== m.warnOn.value
    })
    .map((m) => ({ key: m.key, label: m.label, message: m.warnOn!.message })),
)

const saving = ref(false)
const message = ref<{ text: string; ok: boolean } | null>(null)

async function save() {
  if (!dirty.value.length) return
  saving.value = true
  message.value = null
  try {
    await $fetch(`/api/servers/${props.serverId}/properties`, {
      method: 'PUT',
      body: { updates: Object.fromEntries(dirty.value.map((p) => [p.key, draft.value[p.key]!])) },
    })
    await refresh()
    message.value = {
      // Minecraft ne relit ce fichier qu'au démarrage : le taire laisserait
      // croire que le changement est déjà actif en jeu.
      text: 'Enregistré. Redémarre le serveur pour appliquer les changements.',
      ok: true,
    }
  } catch (e: any) {
    message.value = { text: e?.data?.statusMessage ?? "L'enregistrement a échoué.", ok: false }
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div>
    <div v-if="pending" class="text-[13px] text-ash-dim">Lecture du fichier…</div>

    <!-- Le jeu ne déclare pas de configuration modifiable ici -->
    <div
      v-else-if="data && !data.supported"
      class="rounded-slab border border-dashed border-vein px-5 py-12 text-center"
    >
      <p class="title-display text-chalk">Pas de configuration à éditer ici</p>
      <p class="mt-1 text-[13px] text-ash">
        {{ data.game }} ne range pas ses réglages dans un fichier unique.
        Passe par l'onglet Fichiers pour les trouver.
      </p>
    </div>

    <!-- Format libre : on ouvre le fichier tel quel -->
    <div v-else-if="isText">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <p class="font-mono text-[12px] text-ash-dim">{{ data?.path }}</p>
        <div class="flex items-center gap-3">
          <span v-if="textDirty" class="font-mono text-[11px] text-torch">non enregistré</span>
          <UiBtn size="sm" variant="primary" :disabled="!textDirty || saving" @click="saveText">
            {{ saving ? 'Enregistrement…' : 'Enregistrer' }}
          </UiBtn>
        </div>
      </div>

      <p
        v-if="!data?.initialized"
        class="mt-3 rounded-block border border-vein bg-stone/40 px-3 py-2 text-[12px] text-ash"
      >
        Ce fichier n'existe pas encore : il est créé au premier démarrage du
        serveur. Tu peux l'écrire dès maintenant, il sera pris en compte.
      </p>

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

      <textarea
        v-model="text"
        spellcheck="false"
        aria-label="Contenu du fichier de configuration"
        class="mt-3 h-[30rem] w-full resize-y rounded-slab border border-vein bg-deepslate p-3 font-mono text-[12px] leading-relaxed text-chalk focus:border-torch focus:outline-none"
      />
    </div>

    <div
      v-else-if="!data?.initialized"
      class="rounded-slab border border-dashed border-vein px-5 py-12 text-center"
    >
      <p class="title-display text-chalk">Pas encore de configuration</p>
      <p class="mt-1 text-[13px] text-ash">
        Le fichier est créé au premier démarrage du serveur.
      </p>
    </div>

    <div v-else>
      <p v-if="isLgsm" class="mb-3 text-[13px] text-ash">
        Ces valeurs viennent de LinuxGSM. Celles que tu modifies sont écrites
        dans <span class="font-mono text-[12px] text-ash-dim">{{ data?.path }}</span> ;
        les autres continuent de suivre les valeurs livrées, même après une
        mise à jour.
      </p>

      <div class="flex flex-wrap items-center justify-between gap-3">
        <input
          v-model="query"
          placeholder="Filtrer les clés…"
          aria-label="Filtrer les clés"
          class="h-8 w-56 rounded-block border border-vein bg-deepslate px-2.5 font-mono text-[12px] text-chalk placeholder:text-ash-dim/70 focus:border-torch focus:outline-none"
        />
        <div class="flex items-center gap-3">
          <span v-if="dirty.length" class="font-mono text-[11px] text-torch">
            {{ dirty.length }} modification{{ dirty.length > 1 ? 's' : '' }}
          </span>
          <UiBtn size="sm" variant="primary" :disabled="!dirty.length || saving" @click="save">
            {{ saving ? 'Enregistrement…' : 'Enregistrer' }}
          </UiBtn>
        </div>
      </div>

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

      <!-- Ce qu'on règle vraiment : en contrôles, avec l'effet dit en clair. -->
      <div v-if="guidedGroups.length && !query" class="mt-4 space-y-4">
        <p
          v-for="w in warnings"
          :key="w.key"
          role="alert"
          class="rounded-slab border border-redstone-dim bg-redstone-dim/15 px-4 py-3 text-[13px] text-redstone"
        >
          <span class="block text-chalk">{{ w.label }} — à lire avant d'enregistrer</span>
          <span class="mt-1 block text-ash">{{ w.message }}</span>
        </p>

        <section
          v-for="g in guidedGroups"
          :key="g.id"
          class="rounded-slab border border-vein bg-stone/30 p-4"
        >
          <h3 class="eyebrow">{{ g.label }}</h3>

          <div class="mt-3 space-y-3">
            <div
              v-for="m in g.items"
              :key="m.key"
              class="grid grid-cols-1 gap-x-4 gap-y-1 sm:grid-cols-[minmax(0,1fr)_13rem]"
              :class="draft[m.key] !== rows.find((r) => r.key === m.key)?.value ? 'rounded-block bg-torch-dim/10 px-2 py-1.5' : ''"
            >
              <label :for="`meta-${m.key}`" class="min-w-0">
                <span class="block text-[13px] text-chalk">{{ m.label }}</span>
                <span class="mt-0.5 block text-[12px] leading-snug text-ash-dim">{{ m.hint }}</span>
                <span class="mt-0.5 block font-mono text-[10px] text-ash-dim/70">{{ m.key }}</span>
              </label>

              <!-- Un booléen de server.properties est la chaîne « true » ou
                   « false » : la case à cocher les traduit dans les deux sens. -->
              <div class="sm:pt-0.5">
                <label
                  v-if="m.kind === 'boolean'"
                  class="flex h-9 items-center gap-2.5"
                >
                  <input
                    :id="`meta-${m.key}`"
                    type="checkbox"
                    :checked="isTrue(draft[m.key])"
                    class="h-4 w-4 shrink-0 rounded-[2px] border border-vein-lit bg-deepslate accent-torch"
                    @change="draft[m.key] = ($event.target as HTMLInputElement).checked ? 'true' : 'false'"
                  />
                  <span class="font-mono text-[12px] text-ash">{{ isTrue(draft[m.key]) ? 'activé' : 'désactivé' }}</span>
                </label>

                <select
                  v-else-if="m.kind === 'select'"
                  :id="`meta-${m.key}`"
                  v-model="draft[m.key]"
                  class="h-9 w-full rounded-block border border-vein bg-deepslate px-2.5 text-[13px] text-chalk focus:border-torch focus:outline-none"
                >
                  <option v-for="o in m.options" :key="o.value" :value="o.value">{{ o.label }}</option>
                </select>

                <input
                  v-else
                  :id="`meta-${m.key}`"
                  v-model="draft[m.key]"
                  :type="m.kind === 'number' ? 'number' : 'text'"
                  :min="m.min"
                  :max="m.max"
                  class="h-9 w-full rounded-block border border-vein bg-deepslate px-2.5 font-mono text-[12px] text-chalk focus:border-torch focus:outline-none"
                />
              </div>
            </div>
          </div>
        </section>

        <button
          type="button"
          class="text-[12px] text-ash-dim hover:text-chalk"
          @click="showAll = !showAll"
        >
          {{ showAll ? 'Masquer' : 'Afficher' }} les {{ rows.length }} clés du fichier
        </button>
      </div>

      <div
        v-if="!guidedGroups.length || showAll || query"
        class="mt-4 overflow-hidden rounded-slab border border-vein"
      >
        <div
          v-for="p in visible"
          :key="p.key"
          class="grid grid-cols-1 items-center gap-2 border-b border-vein px-4 py-2 last:border-b-0 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]"
          :class="draft[p.key] !== p.value ? 'bg-torch-dim/10' : ''"
        >
          <label :for="`prop-${p.key}`" class="min-w-0">
            <span class="block truncate font-mono text-[12px] text-ash">
              {{ p.key }}
              <span v-if="p.overridden" class="text-torch" title="Valeur personnalisée">•</span>
            </span>
            <span
              v-if="p.hint && p.hint !== p.value"
              class="block truncate font-mono text-[10px] text-ash-dim"
            >
              livré : {{ p.hint || '(vide)' }}
            </span>
          </label>
          <input
            :id="`prop-${p.key}`"
            v-model="draft[p.key]"
            class="h-8 w-full rounded-block border border-vein bg-deepslate px-2.5 font-mono text-[12px] text-chalk focus:border-torch focus:outline-none"
          />
        </div>
        <p v-if="!visible.length" class="px-4 py-8 text-center text-[13px] text-ash-dim">
          Aucune clé ne correspond à « {{ query }} ».
        </p>
      </div>
    </div>
  </div>
</template>
