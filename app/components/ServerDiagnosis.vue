<script setup lang="ts">
const props = defineProps<{ serverId: string; state: string }>()

interface Diagnosis {
  title: string
  detail: string
  fix?: string
  section?: string
  severity: 'error' | 'warning'
  evidence?: string
  action?: { kind: 'disableMod'; filename: string; label: string }
}

/**
 * On n'interroge le diagnostic que lorsqu'il a une chance de dire quelque
 * chose. Un serveur arrêté ou en erreur doit s'expliquer ; un serveur en
 * marche est interrogé aussi, mais sur une autre question — décroche-t-il ? —
 * qui ne se pose que quand il tourne. Les états transitoires, eux, n'ont
 * encore rien écrit qui vaille d'être lu.
 */
const CHECKED_STATES = ['stopped', 'error', 'running']
const shouldCheck = computed(() => CHECKED_STATES.includes(props.state))

const { data, refresh } = await useFetch<{
  healthy: boolean
  diagnoses: Diagnosis[]
  crashReport?: { filename: string; at: number } | null
}>(() => `/api/servers/${props.serverId}/diagnose`, {
  immediate: shouldCheck.value,
  default: () => ({ healthy: true, diagnoses: [], crashReport: null }),
})

watch(
  () => props.state,
  (s) => {
    if (CHECKED_STATES.includes(s)) refresh()
  },
)

const showEvidence = ref<Record<number, boolean>>({})

/* -- Réparation ----------------------------------------------------------- */

const applying = ref<string | null>(null)
const outcome = ref<{ text: string; ok: boolean } | null>(null)

/**
 * Désactive le mod nommé, puis relance.
 *
 * Les deux gestes vont ensemble : renommer un jar sur un serveur arrêté ne se
 * vérifie qu'au démarrage suivant, et laisser l'utilisateur le déclencher à la
 * main lui ferait croire que rien ne s'est passé.
 */
async function disableMod(action: NonNullable<Diagnosis['action']>) {
  applying.value = action.filename
  outcome.value = null
  try {
    const res = await $fetch<{ restarted: boolean }>(
      `/api/servers/${props.serverId}/content`,
      { method: 'PATCH', body: { filename: action.filename, disabled: true, restart: true } },
    )
    outcome.value = {
      text: res.restarted
        ? `« ${action.filename} » est désactivé, le serveur redémarre. Suis la console pour voir s'il passe.`
        : `« ${action.filename} » est désactivé. Démarre le serveur pour vérifier.`,
      ok: true,
    }
    await refresh()
  } catch (e: any) {
    outcome.value = {
      text: e?.data?.statusMessage ?? "Le mod n'a pas pu être désactivé.",
      ok: false,
    }
  } finally {
    applying.value = null
  }
}
</script>

<template>
  <div v-if="data && (!data.healthy || outcome)" class="space-y-3">
    <p
      v-if="outcome"
      role="status"
      class="rounded-block border px-3 py-2 text-[12px]"
      :class="outcome.ok ? 'border-torch-dim bg-torch-dim/20 text-torch' : 'border-redstone-dim bg-redstone-dim/20 text-redstone'"
    >
      {{ outcome.text }}
    </p>

    <div
      v-for="(d, i) in data.diagnoses"
      :key="i"
      role="alert"
      class="rounded-slab border p-4"
      :class="
        d.severity === 'error'
          ? 'border-redstone-dim bg-redstone-dim/15'
          : 'border-torch-dim bg-torch-dim/15'
      "
    >
      <p
        class="text-[14px]"
        :class="d.severity === 'error' ? 'text-redstone' : 'text-torch'"
      >
        {{ d.title }}
      </p>
      <p class="mt-1.5 text-[13px] text-ash">{{ d.detail }}</p>

      <p v-if="d.fix" class="mt-2 text-[13px] text-chalk">{{ d.fix }}</p>

      <div class="mt-3 flex flex-wrap items-center gap-2">
        <!-- Le geste qui répare passe devant : quand on sait quoi faire, on
             l'offre plutôt que de renvoyer vers un autre onglet. -->
        <UiBtn
          v-if="d.action"
          size="sm"
          variant="primary"
          :disabled="applying === d.action.filename"
          @click="disableMod(d.action)"
        >
          {{ applying === d.action.filename ? 'En cours…' : `${d.action.label} et redémarrer` }}
        </UiBtn>

        <UiBtn
          v-if="d.section"
          size="sm"
          :to="`/servers/${serverId}/${d.section === 'console' ? 'console' : d.section}`"
        >
          {{
            d.section === 'files'
              ? 'Ouvrir les fichiers'
              : d.section === 'backups'
                ? 'Voir les sauvegardes'
                : d.section === 'version'
                  ? 'Changer de version'
                  : d.section === 'config'
                    ? 'Ouvrir la configuration'
                    : 'Ouvrir la console'
          }}
        </UiBtn>

        <!-- La preuve reste disponible, mais repliée : elle sert à qui veut
             vérifier, pas à qui cherche seulement à réparer. -->
        <button
          v-if="d.evidence"
          type="button"
          class="text-[12px] text-ash-dim hover:text-chalk"
          @click="showEvidence[i] = !showEvidence[i]"
        >
          {{ showEvidence[i] ? 'Masquer' : 'Voir' }} la ligne du journal
        </button>
      </div>

      <pre
        v-if="d.evidence && showEvidence[i]"
        class="mt-3 overflow-x-auto rounded-block border border-vein bg-deepslate p-3 font-mono text-[11px] text-ash"
      >{{ d.evidence }}</pre>
    </div>

    <!-- Dire d'où vient le verdict : sans ça, un diagnostic qui nomme un mod
         a l'air d'une devinette du panneau. -->
    <p v-if="data.crashReport" class="font-mono text-[11px] text-ash-dim">
      D'après crash-reports/{{ data.crashReport.filename }}
      ({{ new Date(data.crashReport.at).toLocaleString('fr-FR') }}) —
      <NuxtLink
        :to="`/servers/${serverId}/files?path=crash-reports`"
        class="underline hover:text-chalk"
      >
        ouvrir
      </NuxtLink>
    </p>
  </div>
</template>
