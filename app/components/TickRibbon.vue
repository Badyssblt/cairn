<script setup lang="ts">
import { sampleHealth, type Sample } from '#shared/types'

/**
 * TICK RIBBON — l'élément signature.
 *
 * 16 blocs, parce que 16 est la largeur d'un chunk : le chiffre vient du sujet,
 * il n'est pas arbitraire. Un bloc = un échantillon (~30 s).
 *
 * La couleur encode la santé TPS, le bloc creux encode « arrêté ». C'est donc
 * à la fois un historique d'uptime et une heatmap de lag, dans un objet qui a
 * la forme de son sujet.
 */
const props = withDefaults(
  defineProps<{ samples: Sample[]; slots?: number }>(),
  { slots: 16 },
)

/** Les créneaux sans donnée restent vides à gauche : on ne meuble pas. */
const cells = computed(() => {
  const recent = props.samples.slice(-props.slots)
  const padding = Array<Sample | null>(props.slots - recent.length).fill(null)
  return [...padding, ...recent]
})

function tone(s: Sample | null) {
  if (!s) return 'bg-transparent border border-vein/40'
  if (s.state === 'stopped' || s.state === 'stopping')
    return 'bg-transparent border border-vein-lit'
  if (s.state === 'error') return 'bg-redstone'
  if (s.state === 'starting') return 'bg-torch-dim'

  switch (sampleHealth(s)) {
    case 'good':
      return 'bg-moss'
    case 'degraded':
      return 'bg-torch'
    case 'bad':
      return 'bg-redstone'
    default:
      return 'bg-vein-lit'
  }
}

function caption(s: Sample | null) {
  if (!s) return 'Pas de donnée'
  const time = new Date(s.ts).toLocaleTimeString('fr-FR', {
    hour: '2-digit',
    minute: '2-digit',
  })
  if (s.state !== 'running') return `${time} — ${stateLabel(s.state)}`

  // On nomme la mesure réellement obtenue : annoncer un TPS que vanilla
  // n'expose pas serait inventer un chiffre.
  const load =
    s.tps !== null
      ? `${s.tps.toFixed(1)} tps`
      : s.cpuPercent !== null
        ? `${Math.round(s.cpuPercent)} % CPU`
        : 'pas de mesure'
  return `${time} — ${load}, ${s.players ?? 0} joueurs`
}

function stateLabel(state: Sample['state']) {
  return { stopped: 'arrêté', stopping: 'arrêt', starting: 'démarrage', error: 'erreur', running: '' }[
    state
  ]
}
</script>

<template>
  <div
    class="flex items-center gap-[3px]"
    role="img"
    aria-label="Historique des 8 dernières minutes"
  >
    <span
      v-for="(s, i) in cells"
      :key="i"
      class="h-2.5 w-2.5 rounded-[1px]"
      :class="tone(s)"
      :style="
        i === cells.length - 1 && s
          ? 'animation: block-in 220ms var(--ease-block)'
          : undefined
      "
      :title="caption(s)"
    />
  </div>
</template>
