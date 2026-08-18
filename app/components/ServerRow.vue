<script setup lang="ts">
import { sampleHealth, type MinecraftServer } from '#shared/types'

/**
 * Un conteneur de la liste. Rangée pleine largeur, pas une carte dans une
 * grille : ça reste lisible même à huit serveurs.
 */
const props = defineProps<{ server: MinecraftServer; busy?: boolean }>()
defineEmits<{ start: []; stop: []; restart: []; console: [] }>()

const isRunning = computed(() =>
  ['running', 'starting', 'stopping'].includes(props.server.state),
)
const isInstalling = computed(() => props.server.state === 'installing')

const typeLabel = computed(() =>
  props.server.type === 'MODPACK'
    ? `MODPACK · ${props.server.modpackName ?? props.server.modpackSource ?? 'modpack'}`
    : `${props.server.type} ${props.server.mcVersion}`,
)

const gb = formatGb

/**
 * La charge : le TPS quand le serveur l'expose (Paper/Spigot), sinon le CPU.
 * On n'affiche jamais un TPS inventé pour un serveur vanilla.
 */
const load = computed(() => {
  const s = props.server
  if (isInstalling.value) return { text: 'installation', tone: 'text-lapis' }
  if (s.crashLooping) return { text: 'redémarre en boucle', tone: 'text-redstone' }
  if (s.state === 'error' && props.server.installError)
    return { text: 'échec', tone: 'text-redstone' }
  if (!isRunning.value) return { text: 'arrêté', tone: 'text-ash-dim' }
  if (s.tps !== null) return { text: `${s.tps.toFixed(1)} tps`, tone: tone(s) }
  if (s.cpuPercent !== null)
    return { text: `${Math.round(s.cpuPercent)} % CPU`, tone: tone(s) }
  return { text: 'mesure en cours…', tone: 'text-ash-dim' }
})

/** Ne devient saillant que lorsque ça décroche : sinon ça reste calme. */
function tone(s: MinecraftServer) {
  switch (sampleHealth(s)) {
    case 'degraded':
      return 'text-torch'
    case 'bad':
      return 'text-redstone'
    default:
      return 'text-chalk'
  }
}
</script>

<template>
  <div
    class="group grid grid-cols-1 items-center gap-x-6 gap-y-3 border-b border-vein px-5 py-4 transition-colors hover:bg-stone/40 md:grid-cols-[1fr_auto_auto] md:py-3.5"
  >
    <!-- Identité -->
    <div class="flex min-w-0 items-center gap-3">
      <StatusDot :state="server.state" />
      <div class="min-w-0">
        <NuxtLink
          :to="`/servers/${server.id}`"
          class="title-display block truncate text-[15px] text-chalk hover:text-torch"
        >
          {{ server.name }}
        </NuxtLink>
        <div class="mt-0.5 flex items-center gap-2 font-mono text-[11px] text-ash-dim">
          <span class="truncate">{{ typeLabel }}</span>
          <span class="text-vein-lit">·</span>
          <span>:{{ server.hostPort }}</span>
        </div>
      </div>
    </div>

    <!-- Mesures : le ribbon porte l'histoire, les chiffres portent l'instant.
         Largeurs figées : les colonnes doivent s'aligner d'une rangée à
         l'autre, quel que soit le nombre d'actions à droite. -->
    <div class="flex flex-col items-start gap-2 md:flex-row md:items-center md:gap-5">
      <!-- Pendant l'installation le ribbon n'a rien à raconter : la barre
           d'avancement prend sa place, à la même largeur pour ne pas décaler
           les colonnes. -->
      <div v-if="isInstalling" class="w-[205px] shrink-0">
        <div class="h-2.5 w-full overflow-hidden rounded-[2px] bg-stone">
          <div
            class="h-full rounded-[1px] bg-lapis transition-all duration-500"
            :style="{ width: `${server.install?.progress ?? 0}%` }"
          />
        </div>
      </div>
      <TickRibbon v-else :samples="server.samples" class="shrink-0" />

      <div class="w-full text-left md:w-44 md:shrink-0 md:text-right">
        <div class="font-mono text-[15px] font-semibold leading-tight" :class="load.tone">
          {{ load.text }}
        </div>
        <div class="mt-0.5 font-mono text-[11px] leading-tight text-ash-dim">
          <template v-if="isInstalling">
            {{ server.install?.step }} · {{ Math.round(server.install?.progress ?? 0) }} %
          </template>
          <template v-else-if="server.crashLooping">
            <span class="text-redstone">{{ server.restartCount }} redémarrages</span>
          </template>
          <template v-else-if="isRunning">
            {{ server.players ?? 0 }}/{{ server.maxPlayers ?? '—' }} joueurs ·
            <span :title="`Consommation du conteneur sur une limite de ${gb(server.memoryLimitMb)} Go (tas de ${gb(server.memoryMb)} Go plus la marge hors-tas)`">
              {{ gb(server.ramUsedMb) }}/{{ gb(server.memoryLimitMb) }} Go
            </span>
          </template>
          <template v-else>{{ gb(server.memoryMb) }} Go alloués</template>
        </div>
      </div>
    </div>

    <!-- Actions : elles disent ce qu'elles font -->
    <div
      class="flex items-center justify-end gap-1.5 md:w-[264px] md:opacity-60 md:transition-opacity md:group-hover:opacity-100"
    >
      <span v-if="isInstalling" class="font-mono text-[11px] text-lapis">
        installation en cours…
      </span>
      <UiBtn
        v-else-if="!isRunning"
        size="sm"
        variant="primary"
        :disabled="busy"
        @click="$emit('start')"
      >
        {{ busy ? 'Démarrage…' : 'Démarrer' }}
      </UiBtn>
      <template v-else>
        <UiBtn size="sm" :to="`/servers/${server.id}/console`">Console</UiBtn>
        <UiBtn size="sm" variant="ghost" :disabled="busy" @click="$emit('restart')">
          Redémarrer
        </UiBtn>
        <UiBtn size="sm" variant="ghost" :disabled="busy" @click="$emit('stop')">
          {{ busy ? 'Arrêt…' : 'Arrêter' }}
        </UiBtn>
      </template>
    </div>
  </div>
</template>
