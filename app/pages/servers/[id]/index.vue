<script setup lang="ts">
definePageMeta({ layout: 'server' })

const { id, server, refresh, error } = useServerDetail()
const { data: settings } = await useFetch('/api/settings')
const { data: addr } = await useFetch(() => `/api/servers/${id.value}/address`)

useHead({ title: () => `${server.value?.name ?? 'Serveur'} — Cairn` })

const isRunning = computed(() => server.value?.state === 'running')

const gb = formatGb

const address = computed(() => addr.value?.address ?? '…')

/** D'où vient l'adresse : le dire évite de faire confiance à un nom d'hôte. */
const addressNote = computed(() => {
  switch (addr.value?.source) {
    case 'domaine':
      return null
    case 'ip-publique':
      return "Adresse publique détectée. Tu peux régler un domaine dans les réglages."
    default:
      return "C'est le nom de la machine : tes amis ne pourront pas l'utiliser. Renseigne ton domaine ou ton IP publique dans les réglages."
  }
})

const copied = ref(false)
async function copyAddress() {
  try {
    await navigator.clipboard.writeText(address.value)
    copied.value = true
    setTimeout(() => (copied.value = false), 1800)
  } catch {
    copied.value = false
  }
}

/** Durée en marche, dans l'unité qui a du sens à cette échelle. */
const uptime = computed(() => {
  const s = server.value
  if (!s || s.state !== 'running' || !s.startedAt) return '—'
  const mins = Math.floor((Date.now() - s.startedAt) / 60000)
  if (mins < 60) return `${mins} min`
  const hours = Math.floor(mins / 60)
  if (hours < 48) return `${hours} h`
  return `${Math.floor(hours / 24)} j`
})

const ramPercent = computed(() => {
  const s = server.value
  if (!s || s.ramUsedMb === null || !s.memoryLimitMb) return null
  return (s.ramUsedMb / s.memoryLimitMb) * 100
})

/**
 * Le risque mémoire se lit en marge restante, pas en pourcentage.
 *
 * itzg fixe `-Xms = -Xmx` : la JVM réserve tout son tas au démarrage, donc un
 * serveur sain occupe déjà plus de 90 % de sa limite. Ce qui compte est le
 * coussin restant avant que le noyau ne tue le conteneur.
 */
const ramLevel = computed<'ok' | 'warn' | 'bad' | null>(() => {
  const s = server.value
  if (!s || s.ramUsedMb === null || !s.memoryLimitMb) return null
  const headroom = s.memoryLimitMb - s.ramUsedMb
  if (headroom < 192) return 'bad'
  if (headroom < 448) return 'warn'
  return 'ok'
})

/** Ce que le serveur fait tourner, dit dans les termes de son jeu. */
const identity = computed(() => {
  const s = server.value
  if (!s) return ''
  if (s.game !== 'minecraft') return s.game
  return s.type === 'MODPACK' ? (s.modpackName ?? 'Modpack') : `${s.type} ${s.mcVersion}`
})

onMounted(() => {
  const timer = setInterval(refresh, 10_000)
  onBeforeUnmount(() => clearInterval(timer))
})
</script>

<template>
  <ServerSection v-if="server" title="Tableau de bord">
    <!-- L'adresse est ce qu'on partage le plus : elle est la première chose ici -->
    <section class="rounded-slab border border-vein bg-stone/30 p-4">
      <p class="eyebrow">Adresse de connexion</p>
      <div class="mt-2 flex flex-wrap items-center gap-2">
        <button
          type="button"
          class="flex items-center gap-2.5 rounded-block border border-vein bg-deepslate px-3 py-2 font-mono text-[14px] text-chalk transition-colors hover:border-torch"
          @click="copyAddress"
        >
          {{ address }}
          <NavIcon name="copy" class="h-4 w-4 text-ash-dim" />
        </button>
        <span v-if="copied" class="text-[12px] text-moss">Copiée</span>
      </div>
      <p class="mt-2 text-[12px] text-ash">
        C'est ce que tes joueurs saisissent pour te rejoindre.
      </p>
      <p v-if="addressNote" class="mt-1.5 text-[12px] text-torch">{{ addressNote }}</p>
      <p
        v-if="addr && isRunning"
        class="mt-1.5 flex items-center gap-1.5 font-mono text-[11px] text-ash-dim"
        title="La redirection de ports de ta box n'est pas vérifiable d'ici."
      >
        <span class="h-1.5 w-1.5 shrink-0 rounded-full" :class="addr.listening ? 'bg-moss' : 'bg-redstone'" />
        {{ addr.listening ? 'port ouvert' : 'port fermé' }}
      </p>
    </section>

    <!--
      Le MSPT ne s'affiche que quand le serveur l'expose (Paper). Il occupe la
      place du CPU parce qu'il répond mieux à la même question : le CPU d'un
      conteneur dit ce que consomme la JVM, le MSPT dit ce qu'il reste de marge
      dans le budget de 50 ms d'un tick. Un serveur à 40 ms est au bord du
      décrochage alors que son TPS affiche encore 20,0.
    -->
    <div class="mt-4 grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
      <StatCard
        v-if="isRunning && server.mspt !== null"
        label="Durée d’un tick"
        :value="`${server.mspt.toFixed(1)} ms`"
        suffix="/ 50 ms"
        :percent="Math.min(100, (server.mspt / 50) * 100)"
        :level="server.mspt >= 45 ? 'bad' : server.mspt >= 30 ? 'warn' : undefined"
      />
      <StatCard
        v-else
        label="Processeur"
        :value="server.cpuPercent === null ? '—' : `${Math.round(server.cpuPercent)} %`"
        :percent="server.cpuPercent === null ? null : Math.min(100, server.cpuPercent / 2)"
        :muted="!isRunning"
      />
      <StatCard
        label="Mémoire"
        :value="gb(server.ramUsedMb)"
        :suffix="`/ ${gb(server.memoryLimitMb)} Go`"
        :percent="ramPercent"
        :level="ramLevel"
        :muted="!isRunning"
      />
      <StatCard label="Disque" :value="gb(server.diskUsedMb)" suffix="Go" :percent="null" />
      <StatCard
        label="Joueurs"
        :value="isRunning ? String(server.players ?? 0) : '—'"
        :suffix="isRunning && server.maxPlayers ? `/ ${server.maxPlayers}` : undefined"
        :percent="
          isRunning && server.maxPlayers
            ? ((server.players ?? 0) / server.maxPlayers) * 100
            : null
        "
        :muted="!isRunning"
      />
    </div>

    <PlayerHistory v-if="server" :server-id="server.id" class="mt-4" />

    <!-- Le ribbon garde sa place : c'est la même lecture qu'au tableau de bord -->
    <section class="mt-4 rounded-slab border border-vein bg-stone/30 p-4">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <p class="eyebrow">Huit dernières minutes</p>
        <span class="font-mono text-[11px] text-ash-dim">En marche depuis {{ uptime }}</span>
      </div>
      <div class="mt-3">
        <TickRibbon :samples="server.samples" />
      </div>
    </section>

    <section class="mt-4 grid gap-2.5 sm:grid-cols-2">
      <div class="rounded-slab border border-vein bg-stone/30 p-4">
        <p class="eyebrow">Contenu</p>
        <p class="mt-1.5 text-[13px] text-chalk">{{ identity }}</p>
        <p v-if="server.modpackSource" class="mt-0.5 font-mono text-[11px] text-ash-dim">
          {{ server.modpackSource === 'CURSEFORGE' ? 'CurseForge' : 'Modrinth' }}
        </p>
      </div>
      <div class="rounded-slab border border-vein bg-stone/30 p-4">
        <p class="eyebrow">Mémoire allouée</p>
        <p class="mt-1.5 text-[13px] text-chalk">{{ gb(server.memoryMb) }} Go</p>
        <p class="mt-0.5 font-mono text-[11px] text-ash-dim">
          plafond du conteneur {{ gb(server.memoryLimitMb) }} Go
        </p>
      </div>
    </section>
  </ServerSection>

  <div v-else class="px-5 py-20 text-center">
    <p class="title-display text-chalk">Ce serveur n'existe pas</p>
    <p class="mt-1 text-[13px] text-ash">{{ error ? 'Il a peut-être été supprimé.' : '' }}</p>
    <UiBtn to="/" class="mt-4" size="sm">Retour aux serveurs</UiBtn>
  </div>
</template>
