<script setup lang="ts">
/**
 * Une mesure, sous la forme qu'ont les panneaux d'hébergement : le chiffre en
 * grand, son plafond en petit, et une barre quand il y a un plafond réel.
 *
 * La barre ne s'allume que lorsqu'elle approche de la limite : une jauge qui
 * crie en permanence n'apprend rien.
 */
const props = withDefaults(
  defineProps<{
    label: string
    value: string
    /** Sur-titre du chiffre, ex. « / 4,0 Go ». */
    suffix?: string
    /** 0 à 100. Omis quand la mesure n'a pas de plafond. */
    percent?: number | null
    /**
     * Niveau d'alerte imposé de l'extérieur.
     *
     * Certaines mesures sont hautes sans être inquiétantes : la JVM réserve
     * tout son tas au démarrage, donc la mémoire d'un serveur sain frôle en
     * permanence sa limite. Une jauge qui rougit en continu n'alerte plus de
     * rien, alors l'appelant peut dire ce qui compte vraiment.
     */
    level?: 'ok' | 'warn' | 'bad' | null
    muted?: boolean
  }>(),
  { percent: null, level: null },
)

const tone = computed(() => {
  if (props.muted || props.percent === null) return 'bg-vein-lit'

  const level =
    props.level ??
    (props.percent >= 90 ? 'bad' : props.percent >= 75 ? 'warn' : 'ok')

  return { ok: 'bg-moss', warn: 'bg-torch', bad: 'bg-redstone' }[level]
})
</script>

<template>
  <div class="rounded-slab border border-vein bg-stone/40 px-4 py-3">
    <p class="eyebrow">{{ label }}</p>
    <p class="mt-1.5 flex items-baseline gap-1.5">
      <span class="metric text-xl" :class="muted ? 'text-ash-dim' : 'text-chalk'">
        {{ value }}
      </span>
      <span v-if="suffix" class="font-mono text-[11px] text-ash-dim">{{ suffix }}</span>
    </p>
    <div v-if="percent !== null" class="mt-2 h-1.5 w-full overflow-hidden rounded-[2px] bg-deepslate">
      <div
        class="h-full rounded-[1px] transition-all duration-500"
        :class="tone"
        :style="{ width: `${Math.min(100, Math.max(0, percent))}%` }"
      />
    </div>
  </div>
</template>
