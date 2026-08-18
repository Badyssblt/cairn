<script setup lang="ts">
definePageMeta({ layout: 'server' })

const { id, server, refresh } = useServerDetail()
useHead({ title: () => `Version — ${server.value?.name ?? 'Serveur'}` })

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
</script>

<template>
  <ServerSection
    title="Version"
    hint="Changer de version conserve le monde et les réglages."
  >
    <div
      v-if="data && !data.updatable"
      class="rounded-slab border border-dashed border-vein px-5 py-10 text-center"
    >
      <p class="title-display text-chalk">Rien à mettre à jour ici</p>
      <p class="mt-1 text-[13px] text-ash">
        Ce serveur n'utilise pas de modpack. Sa version se change à la création.
      </p>
    </div>

    <div v-else-if="pending" class="text-[13px] text-ash-dim">Lecture des versions…</div>

    <div v-else class="space-y-4">
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
  </ServerSection>
</template>
