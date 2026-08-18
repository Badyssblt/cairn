<script setup lang="ts">
const props = defineProps<{ serverId: string }>()

interface Schedule {
  id: string
  name: string
  action: string
  payload: string | null
  frequency: 'daily' | 'weekly' | 'interval'
  atHour: number
  atMinute: number
  weekday: number | null
  everyHours: number | null
  enabled: boolean
  lastRunAt: number | null
  lastStatus: string | null
  nextRunAt: number | null
  warnMinutes: number
  skipIfPlayers: boolean
  deferCount: number
}

const { data, refresh } = await useFetch<{ schedules: Schedule[]; canAnnounce: boolean }>(
  () => `/api/servers/${props.serverId}/schedules`,
)

/** Seules ces deux actions coupent la partie de quelqu'un. */
const INTERRUPTS = new Set(['restart', 'stop'])

const ACTIONS = [
  { value: 'backup', label: 'Sauvegarder' },
  { value: 'restart', label: 'Redémarrer' },
  { value: 'stop', label: 'Arrêter' },
  { value: 'start', label: 'Démarrer' },
  { value: 'command', label: 'Envoyer une commande' },
]
const DAYS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi']

/** Deux tâches couvrent l'essentiel : on les propose toutes faites. */
const PRESETS = [
  {
    label: 'Sauvegarde chaque nuit',
    hint: 'Tous les jours à 4 h',
    values: { name: 'Sauvegarde nocturne', action: 'backup', frequency: 'daily', atHour: 4 },
  },
  {
    label: 'Redémarrage quotidien',
    hint: 'Tous les jours à 5 h, annoncé 5 minutes avant',
    values: {
      name: 'Redémarrage quotidien',
      action: 'restart',
      frequency: 'daily',
      atHour: 5,
      warnMinutes: 5,
      skipIfPlayers: true,
    },
  },
]

const form = reactive({
  name: '',
  action: 'backup',
  payload: '',
  frequency: 'daily' as 'daily' | 'weekly' | 'interval',
  atHour: 4,
  atMinute: 0,
  weekday: 0,
  everyHours: 6,
  warnMinutes: 5,
  skipIfPlayers: false,
})

/** Les réglages d'annonce n'ont de sens que sur une coupure. */
const interrupting = computed(() => INTERRUPTS.has(form.action))

const busy = ref(false)
const message = ref<{ text: string; ok: boolean } | null>(null)

function applyPreset(p: (typeof PRESETS)[number]) {
  Object.assign(form, p.values)
}

async function create() {
  busy.value = true
  message.value = null
  try {
    await $fetch(`/api/servers/${props.serverId}/schedules`, {
      method: 'POST',
      body: {
        name: form.name.trim(),
        action: form.action,
        payload: form.action === 'command' ? form.payload.trim() : null,
        frequency: form.frequency,
        atHour: Number(form.atHour),
        atMinute: Number(form.atMinute),
        weekday: form.frequency === 'weekly' ? Number(form.weekday) : null,
        everyHours: form.frequency === 'interval' ? Number(form.everyHours) : null,
        enabled: true,
        warnMinutes:
          interrupting.value && data.value?.canAnnounce ? Number(form.warnMinutes) : 0,
        skipIfPlayers: interrupting.value && form.skipIfPlayers,
      },
    })
    form.name = ''
    form.payload = ''
    await refresh()
  } catch (e: any) {
    message.value = { text: e?.data?.statusMessage ?? "La tâche n'a pas pu être créée.", ok: false }
  } finally {
    busy.value = false
  }
}

async function toggle(s: Schedule) {
  await $fetch(`/api/servers/${props.serverId}/schedules/${s.id}`, {
    method: 'PATCH',
    body: { enabled: !s.enabled },
  })
  await refresh()
}

async function remove(s: Schedule) {
  if (!globalThis.confirm(`Supprimer « ${s.name} » ?`)) return
  await $fetch(`/api/servers/${props.serverId}/schedules/${s.id}`, { method: 'DELETE' })
  await refresh()
}

/** La cadence, dite comme on la dirait à voix haute. */
function cadence(s: Schedule) {
  const time = `${String(s.atHour).padStart(2, '0')} h ${String(s.atMinute).padStart(2, '0')}`
  if (s.frequency === 'daily') return `chaque jour à ${time}`
  if (s.frequency === 'weekly') return `chaque ${DAYS[s.weekday ?? 0]} à ${time}`
  return `toutes les ${s.everyHours} heures`
}

const actionLabel = (a: string) => ACTIONS.find((x) => x.value === a)?.label ?? a
</script>

<template>
  <div>
    <!-- Les deux tâches qu'on met en place neuf fois sur dix -->
    <section class="rounded-slab border border-vein bg-stone/30 p-4">
      <h3 class="eyebrow">Mise en place rapide</h3>
      <div class="mt-3 flex flex-wrap gap-2">
        <button
          v-for="p in PRESETS"
          :key="p.label"
          type="button"
          class="rounded-block border border-vein bg-stone/40 px-3 py-2 text-left transition-colors hover:border-torch"
          @click="applyPreset(p)"
        >
          <span class="block text-[13px] text-chalk">{{ p.label }}</span>
          <span class="block text-[11px] text-ash-dim">{{ p.hint }}</span>
        </button>
      </div>
    </section>

    <section class="mt-4 rounded-slab border border-vein bg-stone/30 p-4">
      <h3 class="eyebrow">Nouvelle tâche</h3>

      <div class="mt-3 grid max-w-xl gap-4 sm:grid-cols-2">
        <UiField v-model="form.name" label="Nom" placeholder="Sauvegarde nocturne" />

        <div>
          <label for="act" class="eyebrow block">Action</label>
          <select
            id="act"
            v-model="form.action"
            class="mt-1.5 h-9 w-full rounded-block border border-vein bg-deepslate px-2.5 text-[13px] text-chalk focus:border-torch focus:outline-none"
          >
            <option v-for="a in ACTIONS" :key="a.value" :value="a.value">{{ a.label }}</option>
          </select>
        </div>

        <UiField
          v-if="form.action === 'command'"
          v-model="form.payload"
          label="Commande"
          placeholder="say Redémarrage dans 5 minutes"
          mono
        />

        <div>
          <label for="freq" class="eyebrow block">Quand</label>
          <select
            id="freq"
            v-model="form.frequency"
            class="mt-1.5 h-9 w-full rounded-block border border-vein bg-deepslate px-2.5 text-[13px] text-chalk focus:border-torch focus:outline-none"
          >
            <option value="daily">Chaque jour</option>
            <option value="weekly">Chaque semaine</option>
            <option value="interval">Toutes les N heures</option>
          </select>
        </div>

        <div v-if="form.frequency === 'weekly'">
          <label for="day" class="eyebrow block">Jour</label>
          <select
            id="day"
            v-model="form.weekday"
            class="mt-1.5 h-9 w-full rounded-block border border-vein bg-deepslate px-2.5 text-[13px] text-chalk focus:border-torch focus:outline-none"
          >
            <option v-for="(d, i) in DAYS" :key="d" :value="i">{{ d }}</option>
          </select>
        </div>

        <div v-if="form.frequency === 'interval'">
          <UiField v-model.number="form.everyHours" label="Toutes les (heures)" type="number" mono />
        </div>

        <div v-else class="flex gap-2">
          <UiField v-model.number="form.atHour" label="Heure" type="number" mono />
          <UiField v-model.number="form.atMinute" label="Minute" type="number" mono />
        </div>
      </div>

      <!-- Une coupure planifiée tombe sur quelqu'un tôt ou tard : ces deux
           réglages sont la différence entre une tâche qu'on laisse active et
           une qu'on finit par désactiver. -->
      <div v-if="interrupting" class="mt-4 space-y-3 border-t border-vein pt-4">
        <div v-if="data?.canAnnounce" class="max-w-xs">
          <label for="warn" class="eyebrow block">Prévenir les joueurs</label>
          <select
            id="warn"
            v-model.number="form.warnMinutes"
            class="mt-1.5 h-9 w-full rounded-block border border-vein bg-deepslate px-2.5 text-[13px] text-chalk focus:border-torch focus:outline-none"
          >
            <option :value="0">Sans prévenir</option>
            <option :value="2">2 minutes avant</option>
            <option :value="5">5 minutes avant</option>
            <option :value="10">10 minutes avant</option>
            <option :value="15">15 minutes avant</option>
          </select>
          <p class="mt-1.5 text-[12px] text-ash-dim">
            Le message s'affiche en jeu, à intervalles décroissants. La coupure a
            lieu à l'heure indiquée, pas après.
          </p>
        </div>
        <p v-else class="text-[12px] text-ash-dim">Ce jeu n'a pas de canal d'annonce.</p>

        <label class="flex items-start gap-2.5">
          <input
            v-model="form.skipIfPlayers"
            type="checkbox"
            class="mt-0.5 h-4 w-4 shrink-0 rounded-[2px] border border-vein-lit bg-deepslate accent-torch"
          />
          <span class="text-[13px] text-chalk">
            Renoncer si quelqu'un joue
            <span class="mt-0.5 block text-[12px] text-ash-dim">
              Réessaie une heure plus tard, jusqu'à six fois. Passé ce délai
              l'occurrence est abandonnée, et la suivante aura lieu normalement.
            </span>
          </span>
        </label>
      </div>

      <p
        v-if="message"
        role="alert"
        class="mt-3 rounded-block border border-redstone-dim bg-redstone-dim/20 px-3 py-2 text-[12px] text-redstone"
      >
        {{ message.text }}
      </p>

      <UiBtn variant="primary" class="mt-4" :disabled="busy || !form.name.trim()" @click="create">
        Créer la tâche
      </UiBtn>
    </section>

    <p
      v-if="!data?.schedules.length"
      class="mt-4 rounded-slab border border-dashed border-vein px-5 py-10 text-center text-[13px] text-ash"
    >
      Aucune tâche planifiée pour l'instant.
    </p>

    <div v-else class="mt-4 overflow-hidden rounded-slab border border-vein">
      <div
        v-for="s in data.schedules"
        :key="s.id"
        class="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-vein px-4 py-3 last:border-b-0"
        :class="s.enabled ? '' : 'opacity-55'"
      >
        <div class="min-w-0 flex-1">
          <p class="truncate text-[13px] text-chalk">{{ s.name }}</p>
          <p class="mt-0.5 font-mono text-[11px] text-ash-dim">
            {{ actionLabel(s.action) }}<template v-if="s.payload"> « {{ s.payload }} »</template>
            · {{ cadence(s) }}<template v-if="s.warnMinutes">
              · annoncé {{ s.warnMinutes }} min avant</template
            ><template v-if="s.skipIfPlayers"> · pas si quelqu'un joue</template>
          </p>
          <p v-if="s.lastRunAt" class="mt-0.5 font-mono text-[11px] text-ash-dim">
            dernière : {{ new Date(s.lastRunAt).toLocaleString('fr-FR') }} — {{ s.lastStatus }}
          </p>
        </div>

        <span v-if="s.enabled && s.nextRunAt" class="font-mono text-[11px] text-ash">
          prochaine : {{ new Date(s.nextRunAt).toLocaleString('fr-FR') }}
        </span>

        <div class="flex gap-1.5">
          <UiBtn size="sm" @click="toggle(s)">
            {{ s.enabled ? 'Suspendre' : 'Reprendre' }}
          </UiBtn>
          <UiBtn size="sm" variant="danger" @click="remove(s)">Supprimer</UiBtn>
        </div>
      </div>
    </div>
  </div>
</template>
