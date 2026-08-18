<script setup lang="ts">
useHead({ title: 'Serveurs — Cairn' })

const { servers, host, pending, error, act, busy } = useServers()

const running = computed(() => servers.value.filter((s) => s.state === 'running').length)
</script>

<template>
  <div>
    <header class="border-b border-vein px-5 py-5 lg:px-8">
      <div class="mx-auto flex max-w-6xl flex-wrap items-end justify-between gap-4">
        <div>
          <h1 class="title-display text-2xl text-chalk">Serveurs</h1>
          <p class="mt-1 text-[13px] text-ash">
            {{ running }} en marche sur {{ servers.length }}
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

    <main class="mx-auto max-w-6xl px-5 py-6 lg:px-8">
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
        <h2 class="eyebrow px-5">Le rack</h2>

        <p
          v-if="error"
          role="alert"
          class="mt-3 rounded-slab border border-redstone-dim bg-redstone-dim/20 px-5 py-3 text-[13px] text-redstone"
        >
          {{ error }}
        </p>

        <div v-if="servers.length" class="mt-3 rounded-slab border border-vein bg-stone/30">
          <ServerRow
            v-for="server in servers"
            :key="server.id"
            :server="server"
            :busy="busy.has(server.id)"
            class="last:border-b-0"
            @start="act(server.id, 'start')"
            @stop="act(server.id, 'stop')"
            @restart="act(server.id, 'restart')"
          />
        </div>

        <!-- L'état vide est une invitation à agir, pas un constat. -->
        <div
          v-else-if="!pending"
          class="mt-3 rounded-slab border border-dashed border-vein px-5 py-14 text-center"
        >
          <p class="title-display text-chalk">Aucun serveur pour l'instant</p>
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
          Lecture du rack…
        </div>
      </section>
    </main>
  </div>
</template>
