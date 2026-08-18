<script setup lang="ts">
/**
 * La capacité de l'hôte, en une seule barre honnête.
 *
 * Elle segmente par serveur plutôt que d'afficher un total agrégé : c'est la
 * lecture qui répond à la vraie question, « qui mange quoi, et me reste-t-il
 * de la place pour un serveur de plus ». La réserve système est visible parce
 * qu'elle est réelle : ce n'est pas de la RAM disponible.
 */
const props = defineProps<{
  totalMb: number
  reserveMb: number
  segments: { id: string; name: string; memoryMb: number; running: boolean }[]
}>()

const allocated = computed(() =>
  props.segments.reduce((sum, s) => sum + s.memoryMb, 0),
)
const usable = computed(() => props.totalMb - props.reserveMb)
const free = computed(() => Math.max(0, usable.value - allocated.value))
const overCommitted = computed(() => allocated.value > usable.value)

const pct = (mb: number) => `${(mb / props.totalMb) * 100}%`
const gb = formatGb

const runningCount = computed(() => props.segments.filter((s) => s.running).length)
</script>

<template>
  <section class="px-5 py-5">
    <div class="flex items-baseline justify-between gap-4">
      <h2 class="eyebrow">Hôte</h2>
      <p class="font-mono text-[11px] text-ash-dim">
        {{ runningCount }} en marche · {{ segments.length - runningCount }} arrêtés
      </p>
    </div>

    <div class="mt-3 flex items-baseline gap-2.5">
      <span class="metric text-3xl" :class="overCommitted ? 'text-redstone' : 'text-chalk'">
        {{ gb(allocated) }}
      </span>
      <span class="font-mono text-xs text-ash-dim">
        / {{ gb(usable) }} Go alloués
      </span>
    </div>

    <!-- La barre est segmentée par serveur : chaque bloc a un propriétaire. -->
    <div class="mt-3 flex h-2.5 w-full gap-[2px] overflow-hidden rounded-[2px] bg-stone">
      <div
        v-for="s in segments"
        :key="s.id"
        class="h-full min-w-[2px] rounded-[1px] transition-all duration-300"
        :class="s.running ? 'bg-torch' : 'bg-vein-lit'"
        :style="{ width: pct(s.memoryMb) }"
        :title="`${s.name} — ${gb(s.memoryMb)} Go`"
      />
      <div class="h-full flex-1 rounded-[1px] bg-transparent" />
      <div
        class="h-full rounded-[1px] bg-vein/60"
        :style="{ width: pct(reserveMb) }"
        title="Réserve système"
      />
    </div>

    <p class="mt-2.5 font-mono text-[11px]" :class="overCommitted ? 'text-redstone' : 'text-ash-dim'">
      <template v-if="overCommitted">
        Sur-alloué de {{ gb(allocated - usable) }} Go. Réduis la mémoire d'un serveur
        avant d'en démarrer un autre.
      </template>
      <template v-else>
        {{ gb(free) }} Go libres · {{ gb(reserveMb) }} Go réservés au système
      </template>
    </p>
  </section>
</template>
