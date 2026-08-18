<script setup lang="ts">
/**
 * Coque d'un serveur : la barre latérale devient celle du serveur.
 *
 * C'est la structure des panneaux d'hébergement — identité, état et commande
 * de démarrage en haut à gauche, puis les sections du serveur en dessous.
 * L'intérêt n'est pas esthétique : l'état du serveur et le bouton d'arrêt
 * restent visibles quelle que soit la section ouverte.
 */
const { id, server, busy, act } = useServerDetail()
const route = useRoute()

interface Section {
  slug: string
  label: string
  icon: 'servers' | 'console' | 'files' | 'players' | 'plus' | 'config' | 'settings' | 'danger'
  /** N'apparaît que sur un serveur Minecraft. */
  minecraftOnly?: boolean
}

const SECTIONS: Section[] = [
  { slug: '', label: 'Tableau de bord', icon: 'servers' as const },
  { slug: 'console', label: 'Console', icon: 'console' as const },
  { slug: 'files', label: 'Fichiers', icon: 'files' as const },
  { slug: 'players', label: 'Joueurs', icon: 'players' as const },
  { slug: 'content', label: 'Mods & plugins', icon: 'plus' as const },
  // Propre à Minecraft : les autres jeux n'ont ni datapacks ni dossiers de
  // monde interchangeables. La page le dit d'elle-même si on y arrive.
  { slug: 'worlds', label: 'Monde', icon: 'servers' as const, minecraftOnly: true },
  { slug: 'config', label: 'Configuration', icon: 'config' as const },
  { slug: 'backups', label: 'Sauvegardes', icon: 'files' as const },
  { slug: 'schedules', label: 'Tâches planifiées', icon: 'console' as const },
  { slug: 'version', label: 'Version', icon: 'plus' as const },
  { slug: 'maintenance', label: 'Entretien', icon: 'settings' as const },
  { slug: 'danger', label: 'Zone de danger', icon: 'danger' as const },
]

/**
 * Une entrée réservée à Minecraft ne s'affiche pas ailleurs : proposer
 * « Monde » sur un serveur Valheim mènerait à une page qui ne sait que dire
 * qu'elle ne s'applique pas.
 */
const sections = computed(() =>
  SECTIONS.filter((s) => !s.minecraftOnly || server.value?.game === 'minecraft'),
)

const base = computed(() => `/servers/${id.value}`)
const linkFor = (slug: string) => (slug ? `${base.value}/${slug}` : base.value)
const isActive = (slug: string) => route.path === linkFor(slug)

const isRunning = computed(() => server.value?.state === 'running')
const inTransition = computed(() =>
  ['starting', 'stopping', 'installing'].includes(server.value?.state ?? ''),
)

const stateLabel = computed(() => {
  switch (server.value?.state) {
    case 'running':
      return 'En marche'
    case 'starting':
      return 'Démarrage'
    case 'stopping':
      return 'Arrêt'
    case 'installing':
      return 'Installation'
    case 'error':
      return 'Erreur'
    default:
      return 'Hors ligne'
  }
})

const drawerOpen = ref(false)
watch(() => route.fullPath, () => (drawerOpen.value = false))
</script>

<template>
  <div class="min-h-screen bg-deepslate">
    <header
      class="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-vein bg-deepslate/95 px-4 backdrop-blur lg:hidden"
    >
      <button
        type="button"
        class="grid h-9 w-9 place-items-center rounded-block border border-vein text-ash hover:text-chalk"
        aria-label="Ouvrir la navigation"
        @click="drawerOpen = !drawerOpen"
      >
        <svg viewBox="0 0 24 24" class="h-5 w-5" fill="none" stroke="currentColor" stroke-width="1.5">
          <path d="M4 7h16M4 12h16M4 17h16" stroke-linecap="round" />
        </svg>
      </button>
      <span class="truncate text-[13px] text-chalk">{{ server?.name ?? 'Serveur' }}</span>
    </header>

    <div class="lg:flex">
      <div
        v-if="drawerOpen"
        class="fixed inset-0 z-40 bg-deepslate/70 lg:hidden"
        @click="drawerOpen = false"
      />

      <aside
        class="fixed inset-y-0 left-0 z-50 flex w-[236px] shrink-0 flex-col border-r border-vein bg-stone/40 transition-transform lg:sticky lg:top-0 lg:z-auto lg:h-screen lg:translate-x-0"
        :class="drawerOpen ? 'translate-x-0' : '-translate-x-full'"
      >
        <!-- Bannière : le visuel du modpack, ou un motif de blocs à défaut -->
        <div class="relative h-24 shrink-0 overflow-hidden border-b border-vein">
          <img
            v-if="server?.iconUrl"
            :src="server.iconUrl"
            alt=""
            class="h-full w-full object-cover opacity-60"
          />
          <div v-else class="grid h-full w-full grid-cols-8 gap-px bg-vein/40 p-2 opacity-50">
            <span
              v-for="i in 24"
              :key="i"
              class="rounded-[1px]"
              :class="i % 5 === 0 ? 'bg-torch-dim' : i % 3 === 0 ? 'bg-vein-lit' : 'bg-stone'"
            />
          </div>
          <div class="absolute inset-0 bg-gradient-to-t from-stone to-transparent" />
        </div>

        <div class="shrink-0 border-b border-vein px-3.5 pb-3.5 pt-2.5">
          <p class="title-display truncate text-[15px] text-chalk">
            {{ server?.name ?? '…' }}
          </p>
          <p class="mt-1 flex items-center gap-1.5 text-[12px]">
            <StatusDot v-if="server" :state="server.state" />
            <span
              :class="
                isRunning ? 'text-moss' : inTransition ? 'text-lapis' : 'text-ash-dim'
              "
            >
              {{ stateLabel }}
            </span>
          </p>

          <!-- La commande la plus utilisée, toujours à portée -->
          <UiBtn
            v-if="!isRunning && !inTransition"
            variant="primary"
            size="sm"
            class="mt-2.5 w-full"
            :disabled="busy"
            @click="act('start')"
          >
            Démarrer
          </UiBtn>
          <div v-else-if="isRunning" class="mt-2.5 flex gap-1.5">
            <UiBtn size="sm" class="flex-1" :disabled="busy" @click="act('restart')">
              Redémarrer
            </UiBtn>
            <UiBtn size="sm" variant="danger" class="flex-1" :disabled="busy" @click="act('stop')">
              Arrêter
            </UiBtn>
          </div>
          <p v-else class="mt-2.5 font-mono text-[11px] text-lapis">
            {{ server?.install ? `${Math.round(server.install.progress)} %` : 'en cours…' }}
          </p>
        </div>

        <nav class="flex-1 overflow-y-auto p-2.5">
          <NuxtLink
            v-for="s in sections"
            :key="s.slug"
            :to="linkFor(s.slug)"
            class="flex items-center gap-2.5 rounded-block border-l-2 px-2.5 py-2 text-[13px] transition-colors"
            :class="
              isActive(s.slug)
                ? 'border-torch bg-stone-lit text-chalk'
                : 'border-transparent text-ash hover:bg-stone hover:text-chalk'
            "
          >
            <NavIcon :name="s.icon" class="h-4 w-4 shrink-0" />
            {{ s.label }}
          </NuxtLink>
        </nav>

        <div class="shrink-0 border-t border-vein p-2.5">
          <NuxtLink
            to="/"
            class="flex items-center gap-2.5 rounded-block px-2.5 py-2 text-[13px] text-ash hover:bg-stone hover:text-chalk"
          >
            ← Tous les serveurs
          </NuxtLink>
        </div>
      </aside>

      <div class="min-w-0 flex-1">
        <slot />
      </div>
    </div>
  </div>
</template>
