<script setup lang="ts">
/**
 * Coque du panneau : barre latérale permanente à gauche, contenu à droite.
 *
 * C'est la structure de tous les panneaux d'hébergement, et ce n'est pas
 * qu'une habitude : la navigation reste visible pendant qu'on travaille dans
 * un serveur, ce qu'une barre horizontale ne permet pas sans remonter.
 *
 * En dessous de `lg`, la barre devient un tiroir : sur mobile, 220 px figés à
 * gauche mangeraient la moitié de l'écran.
 */
const { state, logout } = useAuth()
const route = useRoute()

const nav = [
  { to: '/', label: 'Serveurs', icon: 'servers' as const },
  { to: '/accounts', label: 'Comptes', icon: 'players' as const },
  { to: '/settings', label: 'Réglages', icon: 'settings' as const },
]

const isActive = (to: string) =>
  to === '/' ? route.path === '/' || route.path.startsWith('/servers') : route.path === to

const drawerOpen = ref(false)
watch(() => route.fullPath, () => (drawerOpen.value = false))
</script>

<template>
  <div class="min-h-screen bg-deepslate">
    <!-- Barre supérieure, uniquement pour ouvrir le tiroir sur petit écran -->
    <header
      class="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-vein bg-deepslate/95 px-4 backdrop-blur lg:hidden"
    >
      <button
        type="button"
        class="grid h-9 w-9 place-items-center rounded-block border border-vein text-ash hover:text-chalk"
        :aria-expanded="drawerOpen"
        aria-label="Ouvrir la navigation"
        @click="drawerOpen = !drawerOpen"
      >
        <svg viewBox="0 0 24 24" class="h-5 w-5" fill="none" stroke="currentColor" stroke-width="1.5">
          <path d="M4 7h16M4 12h16M4 17h16" stroke-linecap="round" />
        </svg>
      </button>
      <span class="title-display text-[13px] tracking-wide text-chalk">Cairn</span>
      <NotificationBell class="ml-auto" />
    </header>

    <div class="lg:flex">
      <!-- Voile du tiroir -->
      <div
        v-if="drawerOpen"
        class="fixed inset-0 z-40 bg-deepslate/70 lg:hidden"
        @click="drawerOpen = false"
      />

      <aside
        class="fixed inset-y-0 left-0 z-50 flex w-[228px] shrink-0 flex-col border-r border-vein-lit bg-stone transition-transform lg:sticky lg:top-0 lg:z-auto lg:h-screen lg:translate-x-0"
        :class="drawerOpen ? 'translate-x-0' : '-translate-x-full'"
      >
        <div class="flex h-14 shrink-0 items-center gap-2.5 border-b border-vein px-4">
          <NuxtLink to="/" class="flex min-w-0 flex-1 items-center gap-2.5">
            <span class="grid h-5 w-5 grid-cols-2 grid-rows-2 gap-[2px]">
              <span class="rounded-[1px] bg-torch" />
              <span class="rounded-[1px] bg-vein-lit" />
              <span class="rounded-[1px] bg-vein-lit" />
              <span class="rounded-[1px] bg-torch-dim" />
            </span>
            <span class="title-display text-[13px] tracking-wide text-chalk">Cairn</span>
          </NuxtLink>
          <NotificationBell />
        </div>

        <nav class="flex-1 overflow-y-auto p-2.5">
          <NuxtLink
            v-for="item in nav"
            :key="item.to"
            :to="item.to"
            class="flex items-center gap-2.5 rounded-block border-l-2 px-2.5 py-2 text-[13px] transition-colors"
            :class="
              isActive(item.to)
                ? 'border-torch bg-stone-lit text-chalk'
                : 'border-transparent text-ash hover:bg-stone hover:text-chalk'
            "
          >
            <NavIcon :name="item.icon" class="h-4 w-4 shrink-0" />
            {{ item.label }}
          </NuxtLink>

          <UiBtn variant="primary" size="sm" to="/servers/new" class="mt-3 w-full">
            <NavIcon name="plus" class="h-3.5 w-3.5" />
            Créer un serveur
          </UiBtn>
          <UiBtn size="sm" to="/servers/import" class="mt-1.5 w-full">
            Importer un serveur
          </UiBtn>
        </nav>

        <!-- L'hôte administré, puis le compte : deux informations d'identité -->
        <div class="shrink-0 border-t border-vein p-2.5">
          <div class="flex items-center justify-between px-1 pb-2.5">
            <p v-if="state.host" class="truncate font-mono text-[11px] text-ash-dim">
              {{ state.host }}
            </p>
            <ThemeToggle class="ml-auto" />
          </div>
          <div class="flex items-center gap-2">
            <span
              class="grid h-7 w-7 shrink-0 place-items-center rounded-block bg-vein text-[11px] font-semibold uppercase text-chalk"
            >
              {{ (state.user?.username ?? '?').slice(0, 2) }}
            </span>
            <span class="min-w-0 flex-1 truncate text-[12px] text-ash">
              {{ state.user?.username }}
            </span>
            <button
              type="button"
              class="grid h-7 w-7 shrink-0 place-items-center rounded-block text-ash hover:bg-stone hover:text-chalk"
              title="Se déconnecter"
              aria-label="Se déconnecter"
              @click="logout"
            >
              <NavIcon name="logout" class="h-4 w-4" />
            </button>
          </div>
        </div>
      </aside>

      <div class="min-w-0 flex-1">
        <slot />
      </div>
    </div>
  </div>
</template>
