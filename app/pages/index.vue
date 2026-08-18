<script setup lang="ts">
useHead({ title: 'Serveurs — Cairn' })

const { servers, host, pending, error, act, busy } = useServers()
const { push: toast } = useToast()

const running = computed(() => servers.value.filter((s) => s.state === 'running').length)

const playersOnline = computed(() =>
  servers.value
    .filter((s) => s.state === 'running')
    .reduce((sum, s) => sum + (s.players ?? 0), 0),
)

/** Ce qui mérite d'être vu avant même de dérouler la liste. */
const troubled = computed(() =>
  servers.value.filter((s) => s.crashLooping || s.state === 'error'),
)

const query = ref('')
const filtered = computed(() => {
  const q = query.value.trim().toLowerCase()
  if (!q) return servers.value
  return servers.value.filter(
    (s) =>
      s.name.toLowerCase().includes(q) ||
      s.game.toLowerCase().includes(q) ||
      s.type.toLowerCase().includes(q),
  )
})

/* -- Diffuser un message à tous les serveurs ------------------------------ */

const broadcasting = ref(false)
const broadcastMessage = ref('')
const sendingBroadcast = ref(false)

async function sendBroadcast() {
  const message = broadcastMessage.value.trim()
  if (!message || sendingBroadcast.value) return
  sendingBroadcast.value = true
  try {
    const res = await $fetch<{ sent: number; total: number }>('/api/servers/broadcast', {
      method: 'POST',
      body: { message },
    })
    toast(
      res.sent
        ? `Message envoyé à ${res.sent} serveur${res.sent > 1 ? 's' : ''}.`
        : "Aucun serveur en marche ne pouvait recevoir le message.",
      { tone: res.sent ? 'success' : 'error' },
    )
    broadcastMessage.value = ''
    broadcasting.value = false
  } catch (e: any) {
    toast(e?.data?.statusMessage ?? "L'envoi a échoué.", { tone: 'error' })
  } finally {
    sendingBroadcast.value = false
  }
}
</script>

<template>
  <div>
    <header class="border-b border-vein px-5 py-5 lg:px-8">
      <div class="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 class="title-display text-2xl text-chalk">Serveurs</h1>
          <p class="mt-1 text-[13px] text-ash">
            {{ running }} en marche sur {{ servers.length }}
            <template v-if="running">· {{ playersOnline }} joueur{{ playersOnline > 1 ? 's' : '' }} connecté{{ playersOnline > 1 ? 's' : '' }}</template>
          </p>
        </div>
        <div class="flex gap-2">
          <UiBtn size="sm" to="/servers/import">Importer</UiBtn>
          <UiBtn variant="primary" size="sm" to="/servers/new">
            <NavIcon name="plus" class="h-3.5 w-3.5" />
            Créer un serveur
          </UiBtn>
        </div>
      </div>
    </header>

    <main class="px-5 py-6 lg:px-8">
      <p
        v-if="troubled.length"
        role="alert"
        class="mb-4 rounded-slab border border-redstone-dim bg-redstone-dim/15 px-4 py-3 text-[13px] text-redstone"
      >
        <span class="text-chalk">
          {{ troubled.length }} serveur{{ troubled.length > 1 ? 's ont' : ' a' }} un problème —
        </span>
        <template v-for="(s, i) in troubled" :key="s.id">
          <NuxtLink :to="`/servers/${s.id}`" class="underline hover:text-chalk">{{ s.name }}</NuxtLink
          ><span v-if="i < troubled.length - 1">, </span>
        </template>
      </p>

      <div v-if="host" class="rounded-slab border border-vein bg-stone/30">
        <HostCapacity
          :total-mb="host.totalMb"
          :reserve-mb="host.reserveMb"
          :segments="
            servers.map((s) => ({
              id: s.id,
              name: s.name,
              memoryMb: s.memoryMb,
              running: s.state === 'running',
            }))
          "
        />
      </div>

      <section class="mt-8">
        <div class="flex flex-wrap items-center justify-between gap-3 px-5">
          <h2 class="eyebrow">Docker</h2>
          <div class="flex items-center gap-2">
            <input
              v-model="query"
              placeholder="Filtrer les serveurs…"
              aria-label="Filtrer les serveurs"
              class="h-8 w-48 rounded-block border border-vein bg-deepslate px-2.5 text-[12px] text-chalk placeholder:text-ash-dim/70 focus:border-torch focus:outline-none"
            />
            <UiBtn size="sm" variant="ghost" @click="broadcasting = !broadcasting">
              Message à tous
            </UiBtn>
          </div>
        </div>

        <div v-if="broadcasting" class="mt-3 flex flex-wrap items-center gap-2 px-5">
          <input
            v-model="broadcastMessage"
            placeholder="Message diffusé à tous les serveurs en marche…"
            aria-label="Message à diffuser"
            class="h-8 min-w-0 flex-1 rounded-block border border-vein bg-deepslate px-2.5 text-[12px] text-chalk placeholder:text-ash-dim/70 focus:border-torch focus:outline-none"
            @keydown.enter.prevent="sendBroadcast"
          />
          <UiBtn
            size="sm"
            variant="primary"
            :disabled="!broadcastMessage.trim() || sendingBroadcast"
            @click="sendBroadcast"
          >
            {{ sendingBroadcast ? 'Envoi…' : 'Envoyer' }}
          </UiBtn>
        </div>

        <p
          v-if="error"
          role="alert"
          class="mt-3 rounded-slab border border-redstone-dim bg-redstone-dim/20 px-5 py-3 text-[13px] text-redstone"
        >
          {{ error }}
        </p>

        <div v-if="filtered.length" class="mt-3 rounded-slab border border-vein bg-stone/30">
          <ServerRow
            v-for="server in filtered"
            :key="server.id"
            :server="server"
            :busy="busy.has(server.id)"
            class="last:border-b-0"
            @start="act(server.id, 'start')"
            @stop="act(server.id, 'stop')"
            @restart="act(server.id, 'restart')"
          />
        </div>

        <!-- Le filtre ne trouve rien, mais des serveurs existent : ce n'est
             pas la même situation qu'un panneau réellement vide. -->
        <div
          v-else-if="servers.length && query.trim()"
          class="mt-3 rounded-slab border border-dashed border-vein px-5 py-14 text-center"
        >
          <p class="text-[13px] text-ash">Aucun serveur ne correspond à « {{ query }} ».</p>
          <UiBtn size="sm" class="mt-3" @click="query = ''">Effacer le filtre</UiBtn>
        </div>

        <!-- L'état vide est une invitation à agir, pas un constat. -->
        <div
          v-else-if="!pending"
          class="mt-3 rounded-slab border border-dashed border-vein px-5 py-14 text-center"
        >
          <div class="mx-auto grid h-11 w-11 place-items-center rounded-slab border border-vein bg-deepslate text-ash-dim">
            <NavIcon name="servers" class="h-5 w-5" />
          </div>
          <p class="mt-4 title-display text-chalk">Aucun serveur pour l'instant</p>
          <p class="mt-1 text-[13px] text-ash">Crée le premier pour commencer.</p>
          <div class="mt-4 flex flex-wrap justify-center gap-2">
            <UiBtn variant="primary" size="sm" to="/servers/new">Créer un serveur</UiBtn>
            <UiBtn size="sm" to="/servers/import">Importer un serveur existant</UiBtn>
          </div>
        </div>

        <div
          v-else
          class="mt-3 rounded-slab border border-vein px-5 py-14 text-center text-[13px] text-ash-dim"
        >
          Lecture de Docker…
        </div>
      </section>
    </main>
  </div>
</template>
