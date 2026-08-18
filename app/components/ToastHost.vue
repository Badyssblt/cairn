<script setup lang="ts">
/**
 * Pile de toasts, montée une fois dans app.vue. La sortie n'anime pas : la
 * disparition d'une notification n'a pas besoin d'être remarquée, seule son
 * arrivée doit l'être — même logique que les lignes de console.
 */
const { toasts, dismiss } = useToast()

const TONE_DOT: Record<string, string> = {
  info: 'bg-lapis',
  success: 'bg-moss',
  error: 'bg-redstone',
}
</script>

<template>
  <div class="pointer-events-none fixed inset-x-0 bottom-4 z-[100] flex flex-col items-center gap-2 px-4 sm:inset-x-auto sm:right-4 sm:items-end">
    <div
      v-for="t in toasts"
      :key="t.id"
      role="status"
      style="animation: line-in 140ms ease-out"
      class="pointer-events-auto flex w-full max-w-sm items-center gap-2.5 rounded-slab border border-vein bg-stone px-3.5 py-2.5 shadow-lg"
    >
      <span class="h-1.5 w-1.5 shrink-0 rounded-full" :class="TONE_DOT[t.tone]" />
      <span class="min-w-0 flex-1 text-[13px] text-chalk">{{ t.text }}</span>
      <button
        type="button"
        class="shrink-0 text-ash-dim hover:text-chalk"
        aria-label="Fermer"
        @click="dismiss(t.id)"
      >
        <NavIcon name="plus" class="h-3 w-3 rotate-45" />
      </button>
    </div>
  </div>
</template>
