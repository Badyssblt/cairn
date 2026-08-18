<script setup lang="ts">
import type { ServerState } from '#shared/types'

const props = defineProps<{ state: ServerState }>()

/**
 * Le point de statut. C'est le seul endroit où le vert apparaît : il signifie
 * « en marche », il n'est jamais un accent de marque.
 * Le pouls lent dit « vivant » sans réclamer l'attention.
 */
const style = computed(() => {
  switch (props.state) {
    case 'running':
      return { dot: 'bg-moss', ring: 'bg-moss/20', alive: true, label: 'En marche' }
    case 'starting':
      return { dot: 'bg-torch', ring: 'bg-torch/20', alive: true, label: 'Démarrage' }
    case 'installing':
      return { dot: 'bg-lapis', ring: 'bg-lapis/20', alive: true, label: 'Installation' }
    case 'stopping':
      return { dot: 'bg-torch', ring: 'bg-torch/20', alive: true, label: 'Arrêt' }
    case 'error':
      return { dot: 'bg-redstone', ring: 'bg-redstone/20', alive: false, label: 'Erreur' }
    default:
      return { dot: 'bg-ash-dim', ring: 'bg-transparent', alive: false, label: 'Arrêté' }
  }
})
</script>

<template>
  <span class="relative inline-flex h-2.5 w-2.5 shrink-0" :title="style.label">
    <span
      v-if="style.alive"
      class="absolute inset-0 rounded-full"
      :class="style.ring"
      style="animation: pulse-alive 2.4s ease-in-out infinite"
    />
    <span class="absolute inset-[3px] rounded-full" :class="style.dot" />
    <span class="sr-only">{{ style.label }}</span>
  </span>
</template>
