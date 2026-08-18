<script setup lang="ts">
/**
 * Centre de notifications : une cloche partagée entre la barre mobile et la
 * barre latérale desktop (voir app/layouts/default.vue). L'état — events et
 * lecture — vit dans useNotifications, pas ici, pour que les deux cloches
 * restent d'accord.
 */
const { events, unseenCount, refresh, markSeen } = useNotifications()

const open = ref(false)
const buttonRef = ref<HTMLButtonElement | null>(null)
const panelStyle = ref({ top: '0px', left: '0px' })

/**
 * Positionné en JS plutôt qu'en CSS pur : la cloche vit dans une barre
 * latérale qui a un `transform` (le tiroir mobile), ce qui transforme tout
 * `position: fixed` à l'intérieur en un positionnement relatif à cette barre
 * au lieu de l'écran. Le panneau est téléporté dans `<body>` pour en sortir,
 * et se positionne lui-même à partir des coordonnées réelles du bouton.
 */
function positionPanel() {
  const rect = buttonRef.value?.getBoundingClientRect()
  if (!rect) return
  const width = 320
  const left = Math.min(Math.max(8, rect.right - width), window.innerWidth - width - 8)
  panelStyle.value = { top: `${rect.bottom + 8}px`, left: `${left}px` }
}

function toggle() {
  open.value = !open.value
  if (open.value) {
    refresh()
    markSeen()
    nextTick(positionPanel)
  }
}

function onResize() {
  open.value = false
}
onMounted(() => window.addEventListener('resize', onResize))
onBeforeUnmount(() => window.removeEventListener('resize', onResize))

const LEVEL_DOT: Record<string, string> = {
  bad: 'bg-redstone',
  warn: 'bg-torch',
  good: 'bg-moss',
}

let timer: ReturnType<typeof setInterval> | null = null
onMounted(() => {
  refresh()
  timer = setInterval(refresh, 30_000)
})
onBeforeUnmount(() => {
  if (timer) clearInterval(timer)
})
</script>

<template>
  <div>
    <button
      ref="buttonRef"
      type="button"
      class="relative grid h-8 w-8 place-items-center rounded-block text-ash-dim hover:bg-stone hover:text-chalk"
      aria-label="Notifications"
      :aria-expanded="open"
      @click="toggle"
    >
      <NavIcon name="bell" class="h-4 w-4" />
      <span
        v-if="unseenCount"
        class="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-torch"
      />
    </button>

    <!-- Téléporté dans <body> : voir le commentaire de positionPanel(). -->
    <Teleport to="body">
      <div v-if="open" class="fixed inset-0 z-40" @click="open = false" />

      <div
        v-if="open"
        :style="panelStyle"
        class="fixed z-50 max-h-96 w-80 overflow-y-auto rounded-slab border border-vein bg-stone shadow-lg"
      >
        <p class="eyebrow border-b border-vein px-3.5 py-3">Notifications</p>
        <p v-if="!events.length" class="px-4 py-8 text-center text-[13px] text-ash-dim">
          Rien à signaler.
        </p>
        <div
          v-for="e in events"
          :key="e.id"
          class="flex items-start gap-2.5 border-b border-vein px-3.5 py-2.5 last:border-b-0"
        >
          <span class="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full" :class="LEVEL_DOT[e.level]" />
          <div class="min-w-0 flex-1">
            <p class="text-[13px] text-chalk">{{ e.title }}</p>
            <p class="mt-0.5 text-[12px] leading-snug text-ash">{{ e.detail }}</p>
            <p class="mt-1 font-mono text-[11px] text-ash-dim">
              {{ e.serverName ?? 'Panneau' }} · {{ formatRelativeTime(e.createdAt) }}
            </p>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>
