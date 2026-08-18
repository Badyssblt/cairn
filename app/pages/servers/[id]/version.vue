<script setup lang="ts">
import { SERVER_TYPES, COMMON_MC_VERSIONS, type ServerType } from '#shared/types'
import type { ModpackSelection } from '~/components/ModpackPicker.vue'

definePageMeta({ layout: 'server' })

const { id, server, refresh } = useServerDetail()
useHead({ title: () => `Version — ${server.value?.name ?? 'Serveur'}` })
const { push: toast } = useToast()

interface VersionEntry {
  id: string
  label: string
  meta: string
  installed: boolean
}

const { data, pending, refresh: refreshVersions } = await useFetch<{
  updatable: boolean
  source?: string
  current: string
  versions: VersionEntry[]
}>(() => `/api/servers/${id.value}/versions`)

const chosen = ref('')
watchEffect(() => {
  if (!chosen.value) chosen.value = data.value?.versions[0]?.id ?? ''
})

const installed = computed(() => data.value?.versions.find((v) => v.installed) ?? null)
const chosenEntry = computed(() => data.value?.versions.find((v) => v.id === chosen.value))

/** Rien à proposer si la version choisie est déjà celle qui tourne. */
const isChange = computed(() => Boolean(chosenEntry.value && !chosenEntry.value.installed))

/** Reculer dans la liste est possible, mais ça mérite d'être dit. */
const isDowngrade = computed(() => {
  const vs = data.value?.versions ?? []
  const from = vs.findIndex((v) => v.installed)
  const to = vs.findIndex((v) => v.id === chosen.value)
  return from !== -1 && to !== -1 && to > from
})

const confirming = ref(false)
const working = ref(false)
const message = ref<{ text: string; ok: boolean } | null>(null)

async function apply() {
  if (!isChange.value) return
  working.value = true
  message.value = null
  try {
    await $fetch(`/api/servers/${id.value}/update`, {
      method: 'POST',
      body: { version: chosen.value },
    })
    confirming.value = false
    message.value = {
      text: 'Mise à jour lancée. Le serveur redémarrera une fois les fichiers en place.',
      ok: true,
    }
    await Promise.all([refresh(), refreshVersions()])
  } catch (e: any) {
    message.value = { text: e?.data?.statusMessage ?? "La mise à jour a échoué.", ok: false }
  } finally {
    working.value = false
  }
}

/* -- Changer le type de serveur : reste de la version, pas la mise à jour ci-dessus,
     parce que ça efface tout au lieu de le conserver. -------------------------- */

const newType = ref<ServerType>('PAPER')
const newMcVersion = ref('LATEST')
const newModpack = ref<ModpackSelection | null>(null)
watchEffect(() => {
  if (server.value) newType.value = server.value.type
})
const isModpackTarget = computed(() => newType.value === 'MODPACK')

/**
 * Choisir à nouveau MODPACK sans changer de pack ne déclenche rien : ça
 * effacerait tout pour réinstaller exactement la même chose.
 */
const canRetype = computed(() => {
  if (!server.value) return false
  if (newType.value !== server.value.type) {
    return newType.value !== 'MODPACK' || Boolean(newModpack.value?.project)
  }
  return isModpackTarget.value && Boolean(newModpack.value?.project)
})

const retypeModalOpen = ref(false)
const retyping = ref(false)
const retypeMessage = ref<{ text: string; ok: boolean } | null>(null)

async function confirmRetype() {
  if (!canRetype.value || !server.value) return
  retyping.value = true
  retypeMessage.value = null
  try {
    await $fetch(`/api/servers/${id.value}/retype`, {
      method: 'POST',
      body: {
        confirm: true,
        type: newType.value,
        mcVersion: isModpackTarget.value ? 'LATEST' : newMcVersion.value,
        modpackSource: newModpack.value?.source ?? null,
        modpackProject: newModpack.value?.project ?? null,
        modpackVersion: newModpack.value?.version ?? null,
        modpackLoader: newModpack.value?.loader ?? null,
        modpackName: newModpack.value?.name ?? null,
        modpackIcon: newModpack.value?.iconUrl ?? null,
      },
    })
    retypeModalOpen.value = false
    toast(`Réinstallation de « ${server.value.name} » en cours…`)
    await refresh()
  } catch (e: any) {
    retypeMessage.value = {
      text: e?.data?.statusMessage ?? 'Le changement de type a échoué.',
      ok: false,
    }
  } finally {
    retyping.value = false
  }
}
</script>

<template>
  <ServerSection
    title="Version"
    hint="Changer de version conserve le monde et les réglages."
  >
    <div v-if="pending" class="text-[13px] text-ash-dim">Lecture des versions…</div>

    <div
      v-else-if="data && !data.updatable && server?.game !== 'minecraft'"
      class="rounded-slab border border-dashed border-vein px-5 py-10 text-center"
    >
      <p class="title-display text-chalk">Rien à mettre à jour ici</p>
      <p class="mt-1 text-[13px] text-ash">
        Ce serveur n'utilise pas de modpack. Sa version se change à la création.
      </p>
    </div>

    <div v-else-if="data?.updatable" class="space-y-4">
      <section class="rounded-slab border border-vein bg-stone/30 p-4">
        <p class="eyebrow">Version installée</p>
        <p class="mt-1.5 text-[14px] text-chalk">
          {{ installed?.label ?? 'inconnue' }}
        </p>
        <p v-if="installed" class="mt-0.5 font-mono text-[11px] text-ash-dim">
          {{ installed.meta }}
        </p>
      </section>

      <section class="rounded-slab border border-vein bg-stone/30 p-4">
        <label for="target" class="eyebrow block">Passer à</label>
        <select
          id="target"
          v-model="chosen"
          class="mt-2 h-9 w-full max-w-md rounded-block border border-vein bg-deepslate px-2.5 text-[13px] text-chalk focus:border-torch focus:outline-none"
        >
          <option v-for="v in data?.versions ?? []" :key="v.id" :value="v.id">
            {{ v.label }} — {{ v.meta }}{{ v.installed ? ' (installée)' : '' }}
          </option>
        </select>

        <p v-if="isDowngrade" class="mt-2 text-[12px] text-torch">
          C'est une version antérieure. Un monde créé sur une version plus récente
          peut ne pas se recharger correctement.
        </p>

        <UiBtn
          v-if="!confirming"
          variant="primary"
          class="mt-4"
          :disabled="!isChange"
          @click="confirming = true"
        >
          Mettre à jour
        </UiBtn>

        <!-- L'opération arrête le serveur et remplace des fichiers : elle se
             confirme, en disant exactement ce qui va se passer. -->
        <div
          v-else
          class="mt-4 rounded-block border border-torch-dim bg-torch-dim/10 p-3.5"
        >
          <p class="text-[13px] text-chalk">
            Passer à « {{ chosenEntry?.label }} » ?
          </p>
          <ul class="mt-2 space-y-1 text-[12px] text-ash">
            <li>· Le serveur sera arrêté proprement.</li>
            <li>· Les fichiers de l'ancienne version seront retirés, puis les nouveaux posés.</li>
            <li>· Le monde, les configurations et tes ajouts sont conservés.</li>
          </ul>
          <p class="mt-2 text-[12px] text-ash-dim">
            Fais une sauvegarde de ton monde avant, par sécurité.
          </p>
          <div class="mt-3 flex gap-2">
            <UiBtn variant="primary" :disabled="working" @click="apply">
              {{ working ? 'Lancement…' : 'Confirmer' }}
            </UiBtn>
            <UiBtn variant="ghost" :disabled="working" @click="confirming = false">
              Annuler
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

        <p
          v-if="server?.state === 'installing'"
          class="mt-3 font-mono text-[12px] text-lapis"
        >
          {{ server.install?.step }} · {{ Math.round(server.install?.progress ?? 0) }} %
        </p>
      </section>
    </div>

    <!-- Changer le type : distinct du reste de la page, et indépendant du
         chargement des versions ci-dessus — ça n'a pas la même conséquence,
         tout est remplacé, rien n'est conservé. -->
    <section
      v-if="server?.game === 'minecraft'"
      class="mt-4 rounded-slab border border-redstone-dim/60 bg-redstone-dim/5 p-4"
    >
        <h3 class="eyebrow">Changer le type de serveur</h3>
        <p class="mt-1.5 text-[13px] text-ash">
          Passer d'un type à un autre efface le monde, les mods/plugins et la
          configuration en place ; une installation neuve démarre à la place.
        </p>

        <div class="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          <button
            v-for="t in SERVER_TYPES"
            :key="t.value"
            type="button"
            class="group relative flex flex-col gap-2 rounded-slab border p-3.5 text-left transition-colors"
            :class="
              newType === t.value
                ? 'border-torch bg-torch-dim/15'
                : 'border-vein bg-stone/40 hover:border-vein-lit hover:bg-stone-lit'
            "
            @click="newType = t.value"
          >
            <ServerTypeIcon
              :type="t.value"
              class="h-6 w-6"
              :class="newType === t.value ? 'text-torch' : 'text-ash group-hover:text-chalk'"
            />
            <span>
              <span class="block text-[14px] text-chalk">{{ t.label }}</span>
              <span v-if="t.value === server?.type" class="mt-0.5 block text-[11px] text-ash-dim">
                Type actuel
              </span>
            </span>
          </button>
        </div>

        <div v-if="isModpackTarget" class="mt-3">
          <ModpackPicker v-model="newModpack" />
        </div>
        <div v-else class="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            class="rounded-block border px-3 py-1.5 text-[13px] transition-colors"
            :class="
              newMcVersion === 'LATEST'
                ? 'border-torch bg-torch-dim/15 text-chalk'
                : 'border-vein bg-stone/40 text-ash hover:text-chalk'
            "
            @click="newMcVersion = 'LATEST'"
          >
            Dernière version
          </button>
          <button
            v-for="v in COMMON_MC_VERSIONS"
            :key="v"
            type="button"
            class="rounded-block border px-3 py-1.5 font-mono text-[13px] transition-colors"
            :class="
              newMcVersion === v
                ? 'border-torch bg-torch-dim/15 text-chalk'
                : 'border-vein bg-stone/40 text-ash hover:text-chalk'
            "
            @click="newMcVersion = v"
          >
            {{ v }}
          </button>
        </div>

        <p
          v-if="retypeMessage"
          role="status"
          class="mt-3 rounded-block border px-3 py-2 text-[12px]"
          :class="
            retypeMessage.ok
              ? 'border-torch-dim bg-torch-dim/20 text-torch'
              : 'border-redstone-dim bg-redstone-dim/20 text-redstone'
          "
        >
          {{ retypeMessage.text }}
        </p>

        <UiBtn variant="danger" class="mt-4" :disabled="!canRetype" @click="retypeModalOpen = true">
          Changer le type
        </UiBtn>

        <ConfirmModal
          v-model:open="retypeModalOpen"
          title="Changer le type de serveur ?"
          confirm-label="Tout supprimer et réinstaller"
          :working="retyping"
          @confirm="confirmRetype"
        >
          <p>
            « {{ server?.name }} » sera réinstallé en
            {{ SERVER_TYPES.find((t) => t.value === newType)?.label }}.
          </p>
          <ul class="mt-2 space-y-1 text-[12px]">
            <li>· Le monde, les mods/plugins et la configuration actuels sont supprimés définitivement.</li>
            <li>· Le port et le nom du serveur ne changent pas.</li>
            <li>· Une installation neuve démarre aussitôt.</li>
          </ul>
        </ConfirmModal>
      </section>
  </ServerSection>
</template>
