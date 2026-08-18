<script setup lang="ts">
const props = defineProps<{ serverId: string }>()

const { data, refresh, pending } = await useFetch(
  () => `/api/servers/${props.serverId}/players`,
)

const newPlayer = ref('')
const busy = ref(false)
const notice = ref<{ text: string; ok: boolean } | null>(null)

async function act(action: string, player: string) {
  if (!player) return
  busy.value = true
  notice.value = null
  try {
    await $fetch(`/api/servers/${props.serverId}/players`, {
      method: 'POST',
      body: { action, player },
    })
    await refresh()
    newPlayer.value = ''
  } catch (e: any) {
    notice.value = { text: e?.data?.statusMessage ?? "L'action a échoué.", ok: false }
  } finally {
    busy.value = false
  }
}

// Les listes changent sans nous quand quelqu'un se connecte ou part.
onMounted(() => {
  const timer = setInterval(refresh, 15_000)
  onBeforeUnmount(() => clearInterval(timer))
})
</script>

<template>
  <div class="space-y-5">
    <p
      v-if="notice"
      role="alert"
      class="rounded-block border px-3 py-2 text-[12px]"
      :class="
        notice.ok
          ? 'border-torch-dim bg-torch-dim/20 text-torch'
          : 'border-redstone-dim bg-redstone-dim/20 text-redstone'
      "
    >
      {{ notice.text }}
    </p>

    <!-- Connectés -->
    <section class="rounded-slab border border-vein">
      <header class="flex items-center justify-between border-b border-vein px-4 py-2.5">
        <h3 class="eyebrow">Connectés</h3>
        <span class="font-mono text-[11px] text-ash-dim">
          {{ data?.online.count ?? 0 }}/{{ data?.online.max ?? '—' }}
        </span>
      </header>

      <p v-if="!data?.running" class="px-4 py-6 text-center text-[13px] text-ash-dim">
        Le serveur est arrêté.
      </p>
      <p
        v-else-if="!data.online.names.length"
        class="px-4 py-6 text-center text-[13px] text-ash-dim"
      >
        Personne n'est connecté pour l'instant.
      </p>
      <div v-else class="divide-y divide-vein">
        <div
          v-for="p in data.online.names"
          :key="p"
          class="group flex items-center gap-3 px-4 py-2"
        >
          <span class="flex-1 truncate text-[13px] text-chalk">{{ p }}</span>
          <div class="flex gap-1.5 opacity-0 transition-opacity group-hover:opacity-100">
            <UiBtn size="sm" variant="ghost" :disabled="busy" @click="act('op', p)">Op</UiBtn>
            <UiBtn size="sm" variant="ghost" :disabled="busy" @click="act('kick', p)">
              Expulser
            </UiBtn>
            <UiBtn size="sm" variant="danger" :disabled="busy" @click="act('ban', p)">
              Bannir
            </UiBtn>
          </div>
        </div>
      </div>
    </section>

    <!-- Ajout par pseudo, pour agir sur quelqu'un d'absent -->
    <section class="rounded-slab border border-vein px-4 py-3.5">
      <h3 class="eyebrow">Ajouter un joueur</h3>
      <p class="mt-1.5 text-[13px] text-ash">
        Fonctionne aussi sur un joueur qui n'est pas connecté.
      </p>
      <div class="mt-3 flex flex-wrap gap-2">
        <input
          v-model="newPlayer"
          placeholder="Pseudo Minecraft"
          aria-label="Pseudo Minecraft"
          class="h-9 min-w-[180px] flex-1 rounded-block border border-vein bg-deepslate px-2.5 font-mono text-[13px] text-chalk placeholder:text-ash-dim/70 focus:border-torch focus:outline-none"
        />
        <UiBtn :disabled="busy || !newPlayer.trim()" @click="act('whitelistAdd', newPlayer.trim())">
          Autoriser
        </UiBtn>
        <UiBtn :disabled="busy || !newPlayer.trim()" @click="act('op', newPlayer.trim())">
          Passer op
        </UiBtn>
        <UiBtn
          variant="danger"
          :disabled="busy || !newPlayer.trim()"
          @click="act('ban', newPlayer.trim())"
        >
          Bannir
        </UiBtn>
      </div>
    </section>

    <!-- Les trois listes du serveur, côte à côte -->
    <div class="grid gap-4 md:grid-cols-3">
      <section class="rounded-slab border border-vein">
        <header class="border-b border-vein px-4 py-2.5">
          <h3 class="eyebrow">Opérateurs</h3>
        </header>
        <p v-if="!data?.ops.length" class="px-4 py-5 text-[12px] text-ash-dim">Aucun.</p>
        <div v-else class="divide-y divide-vein">
          <div v-for="o in data.ops" :key="o.name" class="group flex items-center gap-2 px-4 py-2">
            <span class="flex-1 truncate text-[13px] text-chalk">{{ o.name }}</span>
            <button
              type="button"
              class="text-[11px] text-ash-dim opacity-0 hover:text-redstone group-hover:opacity-100"
              @click="act('deop', o.name)"
            >
              Retirer
            </button>
          </div>
        </div>
      </section>

      <section class="rounded-slab border border-vein">
        <header class="border-b border-vein px-4 py-2.5">
          <h3 class="eyebrow">Autorisés</h3>
        </header>
        <p v-if="!data?.whitelist.length" class="px-4 py-5 text-[12px] text-ash-dim">
          Aucun. Le serveur est ouvert à tous.
        </p>
        <div v-else class="divide-y divide-vein">
          <div
            v-for="w in data.whitelist"
            :key="w.name"
            class="group flex items-center gap-2 px-4 py-2"
          >
            <span class="flex-1 truncate text-[13px] text-chalk">{{ w.name }}</span>
            <button
              type="button"
              class="text-[11px] text-ash-dim opacity-0 hover:text-redstone group-hover:opacity-100"
              @click="act('whitelistRemove', w.name)"
            >
              Retirer
            </button>
          </div>
        </div>
      </section>

      <section class="rounded-slab border border-vein">
        <header class="border-b border-vein px-4 py-2.5">
          <h3 class="eyebrow">Bannis</h3>
        </header>
        <p v-if="!data?.banned.length" class="px-4 py-5 text-[12px] text-ash-dim">Aucun.</p>
        <div v-else class="divide-y divide-vein">
          <div
            v-for="b in data.banned"
            :key="b.name"
            class="group flex items-center gap-2 px-4 py-2"
          >
            <span class="flex-1 truncate text-[13px] text-chalk">{{ b.name }}</span>
            <button
              type="button"
              class="text-[11px] text-ash-dim opacity-0 hover:text-moss group-hover:opacity-100"
              @click="act('pardon', b.name)"
            >
              Gracier
            </button>
          </div>
        </div>
      </section>
    </div>
  </div>
</template>
