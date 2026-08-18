<script setup lang="ts">
useHead({ title: 'Importer un serveur — Cairn' })

interface Detection {
  path: string
  name: string
  type: string
  mcVersion: string
  hostPort: number
  maxPlayers: number | null
  motd: string | null
  hasWorld: boolean
  modCount: number
  problem: string | null
}

const { data: settings } = await useFetch('/api/settings')
const { data: existing } = await useFetch('/api/servers')

const searchPath = ref('')
watchEffect(() => {
  if (!searchPath.value && settings.value?.dataRoot) searchPath.value = settings.value.dataRoot
})

const candidates = ref<Detection[]>([])
const scanning = ref(false)
const scanError = ref<string | null>(null)
const scanned = ref(false)

async function scan(single = false) {
  scanning.value = true
  scanError.value = null
  try {
    const res = await $fetch<{ candidates: Detection[] }>('/api/servers/scan', {
      query: { path: searchPath.value, single: single ? 'true' : 'false' },
    })
    candidates.value = res.candidates.filter((c) => !c.problem)
    if (single && res.candidates[0]?.problem) scanError.value = res.candidates[0].problem
    scanned.value = true
  } catch (e: any) {
    scanError.value = e?.data?.statusMessage ?? "Ce dossier n'a pas pu être lu."
    candidates.value = []
  } finally {
    scanning.value = false
  }
}

/* -- Adoption ------------------------------------------------------------ */

const chosen = ref<Detection | null>(null)
const name = ref('')
const memoryGb = ref(4)
const hostPort = ref(25565)

const takenPorts = computed(
  () => new Set((existing.value?.servers ?? []).map((s) => s.hostPort)),
)

function select(c: Detection) {
  chosen.value = c
  name.value = c.name
  // Le port lu dans server.properties est le bon, sauf s'il est déjà pris.
  hostPort.value = takenPorts.value.has(c.hostPort) ? c.hostPort + 1 : c.hostPort
}

const importing = ref(false)
const error = ref<string | null>(null)

async function adopt() {
  if (!chosen.value) return
  importing.value = true
  error.value = null
  try {
    const res = await $fetch('/api/servers/import', {
      method: 'POST',
      body: {
        path: chosen.value.path,
        name: name.value.trim(),
        memoryMb: Math.round(memoryGb.value * 1024),
        hostPort: hostPort.value,
      },
    })
    await navigateTo(`/servers/${res.server.id}`)
  } catch (e: any) {
    error.value = e?.data?.statusMessage ?? "L'import a échoué."
    importing.value = false
  }
}
</script>

<template>
  <div>
    <header class="border-b border-vein px-5 py-5 lg:px-8">
      <div class="mx-auto max-w-3xl">
        <NuxtLink to="/" class="eyebrow hover:text-ash">← Serveurs</NuxtLink>
        <h1 class="title-display mt-1 text-2xl text-chalk">Importer un serveur</h1>
        <p class="mt-1.5 text-[13px] text-ash">
          Reprends un serveur déjà présent sur cette machine. Son dossier reste
          où il est : rien n'est déplacé ni copié.
        </p>
      </div>
    </header>

    <main class="mx-auto max-w-3xl px-5 py-6 lg:px-8">
      <!-- 1 · Où chercher -->
      <section>
        <h2 class="eyebrow">Où sont tes serveurs ?</h2>
        <p class="mt-1.5 text-[13px] text-ash">
          Indique le dossier qui les contient. Chaque sous-dossier sera examiné.
        </p>
        <form class="mt-3 flex flex-wrap gap-2" @submit.prevent="scan(false)">
          <input
            v-model="searchPath"
            placeholder="/home/minecraft"
            aria-label="Dossier à examiner"
            class="h-9 min-w-[220px] flex-1 rounded-block border border-vein bg-deepslate px-2.5 font-mono text-[13px] text-chalk placeholder:text-ash-dim/70 focus:border-torch focus:outline-none"
          />
          <UiBtn type="submit" :disabled="scanning">
            {{ scanning ? 'Recherche…' : 'Chercher' }}
          </UiBtn>
          <UiBtn variant="ghost" :disabled="scanning" @click="scan(true)">
            C'est ce dossier
          </UiBtn>
        </form>

        <p
          v-if="scanError"
          role="alert"
          class="mt-3 rounded-block border border-redstone-dim bg-redstone-dim/20 px-3 py-2 text-[12px] text-redstone"
        >
          {{ scanError }}
        </p>
      </section>

      <!-- 2 · Ce qui a été trouvé -->
      <section v-if="scanned && !chosen" class="mt-7">
        <h2 class="eyebrow">Serveurs trouvés</h2>

        <p
          v-if="!candidates.length"
          class="mt-3 rounded-slab border border-dashed border-vein px-5 py-10 text-center text-[13px] text-ash"
        >
          Aucun serveur ici. Vérifie le chemin, ou utilise « C'est ce dossier » si
          tu as indiqué le dossier du serveur lui-même.
        </p>

        <div v-else class="mt-3 space-y-2">
          <button
            v-for="c in candidates"
            :key="c.path"
            type="button"
            class="flex w-full flex-wrap items-center gap-x-5 gap-y-2 rounded-slab border border-vein bg-stone/40 p-3.5 text-left transition-colors hover:border-torch hover:bg-stone-lit"
            @click="select(c)"
          >
            <ServerTypeIcon
              :type="(c.type as any)"
              class="h-6 w-6 shrink-0 text-ash"
            />
            <span class="min-w-0 flex-1">
              <span class="block truncate text-[14px] text-chalk">{{ c.name }}</span>
              <span class="block truncate font-mono text-[11px] text-ash-dim">{{ c.path }}</span>
            </span>
            <span class="font-mono text-[11px] text-ash">
              {{ c.type }} {{ c.mcVersion }} · port {{ c.hostPort }}
              <template v-if="c.modCount"> · {{ c.modCount }} mods</template>
              <template v-if="c.hasWorld"> · monde présent</template>
            </span>
          </button>
        </div>
      </section>

      <!-- 3 · Confirmer l'adoption -->
      <section v-if="chosen" class="mt-7">
        <h2 class="eyebrow">Vérifie avant d'importer</h2>
        <p class="mt-1.5 text-[13px] text-ash">
          Ces valeurs ont été lues dans le dossier. Corrige-les si besoin.
        </p>

        <div class="mt-3 rounded-slab border border-vein bg-stone/30 p-4">
          <p class="font-mono text-[12px] text-ash-dim">{{ chosen.path }}</p>
          <p class="mt-1 font-mono text-[12px] text-ash">
            détecté : {{ chosen.type }} {{ chosen.mcVersion }}
            <template v-if="chosen.modCount"> · {{ chosen.modCount }} mods</template>
            <template v-if="chosen.hasWorld"> · monde présent</template>
          </p>

          <div class="mt-4 grid gap-4 sm:grid-cols-2">
            <UiField v-model="name" label="Nom dans le panneau" />
            <UiField v-model.number="hostPort" label="Port" type="number" mono />
            <UiField
              v-model.number="memoryGb"
              label="Mémoire (Go)"
              type="number"
              mono
              hint="Le serveur sera relancé avec cette allocation."
            />
          </div>

          <p
            v-if="error"
            role="alert"
            class="mt-4 rounded-block border border-redstone-dim bg-redstone-dim/20 px-3 py-2 text-[12px] text-redstone"
          >
            {{ error }}
          </p>

          <p class="mt-4 text-[12px] text-ash-dim">
            Le serveur ne sera pas démarré automatiquement : tu vérifies d'abord,
            puis tu le lances toi-même.
          </p>

          <div class="mt-3 flex gap-2">
            <UiBtn variant="primary" :disabled="importing || !name.trim()" @click="adopt">
              {{ importing ? 'Import…' : 'Importer ce serveur' }}
            </UiBtn>
            <UiBtn variant="ghost" :disabled="importing" @click="chosen = null">
              Retour
            </UiBtn>
          </div>
        </div>
      </section>
    </main>
  </div>
</template>
