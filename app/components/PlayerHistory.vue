<script setup lang="ts">
const props = defineProps<{ serverId: string }>()

interface Point {
  ts: number
  players: number
  tps: number | null
}

const hours = ref(24)

const { data, pending } = await useFetch<{
  hours: number
  points: Point[]
  summary: { peak: number; averageWhenActive: number; activeMinutes: number }
}>(() => `/api/servers/${props.serverId}/history`, {
  query: { hours },
})

/* -- Géométrie ------------------------------------------------------------
 * Le tracé est calculé dans un repère fixe puis étiré par le SVG : les
 * proportions restent justes à n'importe quelle largeur.
 */
const W = 720
const H = 160
const PAD = { top: 12, right: 8, bottom: 22, left: 28 }

const points = computed(() => data.value?.points ?? [])

/** Échelle entière : un nombre de joueurs n'a pas de décimale. */
const maxPlayers = computed(() =>
  Math.max(4, ...points.value.map((p) => p.players)),
)

const scaled = computed(() => {
  const pts = points.value
  if (pts.length < 2) return []
  const t0 = pts[0]!.ts
  const span = Math.max(1, pts[pts.length - 1]!.ts - t0)
  const w = W - PAD.left - PAD.right
  const h = H - PAD.top - PAD.bottom

  return pts.map((p) => ({
    ...p,
    x: PAD.left + ((p.ts - t0) / span) * w,
    y: PAD.top + h - (p.players / maxPlayers.value) * h,
  }))
})

const linePath = computed(() =>
  scaled.value.map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' '),
)

const areaPath = computed(() => {
  const s = scaled.value
  if (!s.length) return ''
  const base = H - PAD.bottom
  return `${linePath.value} L${s[s.length - 1]!.x.toFixed(1)},${base} L${s[0]!.x.toFixed(1)},${base} Z`
})

/** Trois graduations suffisent : la grille doit rester en retrait. */
const yTicks = computed(() => {
  const m = maxPlayers.value
  return [0, Math.round(m / 2), m].map((v) => ({
    value: v,
    y: PAD.top + (H - PAD.top - PAD.bottom) * (1 - v / m),
  }))
})

const xTicks = computed(() => {
  const s = scaled.value
  if (s.length < 2) return []
  return [s[0]!, s[Math.floor(s.length / 2)]!, s[s.length - 1]!].map((p) => ({
    x: p.x,
    label: new Date(p.ts).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }),
  }))
})

/* -- Survol ---------------------------------------------------------------
 * Un graphique de tendance sans lecture point par point oblige à deviner les
 * valeurs : le repère suit le pointeur et donne le chiffre exact.
 */
const hover = ref<(typeof scaled.value)[number] | null>(null)
const svgEl = ref<SVGSVGElement | null>(null)

function onMove(e: MouseEvent) {
  const el = svgEl.value
  const s = scaled.value
  if (!el || !s.length) return

  const rect = el.getBoundingClientRect()
  const x = ((e.clientX - rect.left) / rect.width) * W

  let best = s[0]!
  for (const p of s) {
    if (Math.abs(p.x - x) < Math.abs(best.x - x)) best = p
  }
  hover.value = best
}

const hoverLabel = computed(() => {
  const h = hover.value
  if (!h) return ''
  const time = new Date(h.ts).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
  const tps = h.tps === null ? '' : ` · ${h.tps.toFixed(1)} tps`
  return `${time} — ${h.players} joueur${h.players > 1 ? 's' : ''}${tps}`
})

const enoughData = computed(() => points.value.length >= 2)
</script>

<template>
  <section class="rounded-slab border border-vein bg-stone/30 p-4">
    <div class="flex flex-wrap items-baseline justify-between gap-3">
      <h3 class="eyebrow">Fréquentation</h3>
      <div class="flex gap-1">
        <button
          v-for="h in [6, 24, 48]"
          :key="h"
          type="button"
          class="rounded-block px-2 py-1 font-mono text-[11px] transition-colors"
          :class="hours === h ? 'bg-stone-lit text-chalk' : 'text-ash-dim hover:text-chalk'"
          @click="hours = h"
        >
          {{ h }} h
        </button>
      </div>
    </div>

    <!-- Les chiffres qui comptent, en texte : ils restent lisibles sans le
         graphique, et tiennent lieu de tableau de valeurs. -->
    <p v-if="data" class="mt-2 text-[13px] text-ash">
      Pointe à <span class="text-chalk">{{ data.summary.peak }}</span> joueurs ·
      <span class="text-chalk">{{ data.summary.averageWhenActive }}</span> en moyenne
      quand le serveur est fréquenté ·
      <span class="text-chalk">
        {{ Math.round(data.summary.activeMinutes / 60) }} h
      </span>
      d'activité
    </p>

    <p v-if="pending" class="mt-4 text-[13px] text-ash-dim">Lecture…</p>

    <p v-else-if="!enoughData" class="mt-4 text-[13px] text-ash-dim">
      Pas encore assez de relevés. La courbe apparaîtra après quelques dizaines
      de minutes de fonctionnement.
    </p>

    <div v-else class="relative mt-3">
      <svg
        ref="svgEl"
        :viewBox="`0 0 ${W} ${H}`"
        class="w-full"
        role="img"
        :aria-label="`Fréquentation sur ${hours} heures, pointe à ${data?.summary.peak} joueurs`"
        @mousemove="onMove"
        @mouseleave="hover = null"
      >
        <!-- Grille en retrait : elle situe, elle ne se regarde pas -->
        <g>
          <line
            v-for="t in yTicks"
            :key="t.value"
            :x1="PAD.left"
            :x2="W - PAD.right"
            :y1="t.y"
            :y2="t.y"
            stroke="#2C313D"
            stroke-width="1"
          />
          <text
            v-for="t in yTicks"
            :key="`l${t.value}`"
            :x="PAD.left - 6"
            :y="t.y + 3"
            text-anchor="end"
            fill="#5D636F"
            font-size="9"
            font-family="IBM Plex Mono, monospace"
          >
            {{ t.value }}
          </text>
        </g>

        <defs>
          <linearGradient id="playersFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="#C97B2E" stop-opacity="0.35" />
            <stop offset="100%" stop-color="#C97B2E" stop-opacity="0.02" />
          </linearGradient>
        </defs>

        <path :d="areaPath" fill="url(#playersFill)" />
        <path
          :d="linePath"
          fill="none"
          stroke="#C97B2E"
          stroke-width="2"
          stroke-linejoin="round"
          stroke-linecap="round"
        />

        <!-- Repère de survol -->
        <g v-if="hover">
          <line
            :x1="hover.x"
            :x2="hover.x"
            :y1="PAD.top"
            :y2="H - PAD.bottom"
            stroke="#8A909E"
            stroke-width="1"
            stroke-dasharray="3 3"
          />
          <!-- Anneau de surface : le point reste lisible sur la courbe -->
          <circle :cx="hover.x" :cy="hover.y" r="5" fill="#14161C" />
          <circle :cx="hover.x" :cy="hover.y" r="3.5" fill="#C97B2E" />
        </g>

        <text
          v-for="t in xTicks"
          :key="t.label"
          :x="t.x"
          :y="H - 6"
          text-anchor="middle"
          fill="#5D636F"
          font-size="9"
          font-family="IBM Plex Mono, monospace"
        >
          {{ t.label }}
        </text>
      </svg>

      <p
        v-if="hover"
        class="pointer-events-none absolute left-0 top-0 rounded-block border border-vein bg-deepslate px-2 py-1 font-mono text-[11px] text-chalk"
      >
        {{ hoverLabel }}
      </p>
    </div>
  </section>
</template>
