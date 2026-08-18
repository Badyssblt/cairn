<script setup lang="ts">
const props = defineProps<{ serverId: string; running: boolean }>()

interface Line {
  id: number
  text: string
  kind: 'line' | 'echo' | 'reply' | 'error' | 'system'
}

/** Au-delà, le DOM devient le facteur limitant de la page. */
const MAX_LINES = 500

/**
 * Lignes que le panneau provoque lui-même et qui n'apprennent rien.
 *
 * Minecraft journalise chaque connexion et déconnexion RCON, et il ferme les
 * connexions inactives : nos relevés de statistiques rouvrent donc une session
 * régulièrement, ce qui noierait la console sous nos propres allées et venues.
 * On masque ces lignes plutôt que de renoncer aux relevés.
 */
const SELF_NOISE = /Thread RCON Client .* (started|shutting down)|\[RCON Listener/

function isNoise(line: string) {
  return SELF_NOISE.test(line)
}

const lines = ref<Line[]>([])
const input = ref('')
const connected = ref(false)
const viewport = ref<HTMLElement | null>(null)
const pinned = ref(true)
let seq = 0
let ws: WebSocket | null = null

/** Les commandes déjà tapées, rappelables aux flèches — comme un shell. */
const history = ref<string[]>([])
const historyIndex = ref(-1)

function push(text: string, kind: Line['kind'] = 'line') {
  lines.value.push({ id: seq++, text, kind })
  if (lines.value.length > MAX_LINES) {
    lines.value.splice(0, lines.value.length - MAX_LINES)
  }
  if (pinned.value) nextTick(scrollToEnd)
}

function scrollToEnd() {
  const el = viewport.value
  if (el) el.scrollTop = el.scrollHeight
}

/** On ne rattrape pas l'utilisateur qui remonte volontairement dans l'historique. */
function onScroll() {
  const el = viewport.value
  if (!el) return
  pinned.value = el.scrollHeight - el.scrollTop - el.clientHeight < 40
}

function connect() {
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:'
  ws = new WebSocket(`${proto}//${location.host}/api/servers/${props.serverId}/console`)

  ws.onopen = () => {
    connected.value = true
  }
  ws.onclose = () => {
    connected.value = false
  }
  ws.onmessage = (ev) => {
    try {
      const { type, data } = JSON.parse(ev.data)
      const text = String(data)
      if (type === 'line' && isNoise(text)) return
      push(text, type)
    } catch {
      push(String(ev.data))
    }
  }
}

function submit() {
  const text = input.value.trim()
  if (!text || !ws || ws.readyState !== WebSocket.OPEN) return
  ws.send(text)
  history.value.push(text)
  historyIndex.value = -1
  input.value = ''
  pinned.value = true
}

function recall(direction: -1 | 1) {
  if (!history.value.length) return
  if (historyIndex.value === -1 && direction === 1) return

  const next =
    historyIndex.value === -1
      ? history.value.length - 1
      : Math.min(history.value.length - 1, Math.max(0, historyIndex.value + direction))

  historyIndex.value = next
  input.value = history.value[next] ?? ''
}

const toneOf = (kind: Line['kind']) =>
  ({
    echo: 'text-torch',
    reply: 'text-chalk',
    error: 'text-redstone',
    system: 'text-ash-dim',
    line: 'text-ash',
  })[kind]

onMounted(connect)
onBeforeUnmount(() => ws?.close())
</script>

<template>
  <div class="flex h-[560px] flex-col rounded-slab border border-vein bg-deepslate">
    <div class="flex items-center justify-between border-b border-vein px-3 py-2">
      <span class="eyebrow">Console</span>
      <span class="flex items-center gap-2 font-mono text-[11px] text-ash-dim">
        <span
          class="h-1.5 w-1.5 rounded-full"
          :class="connected ? 'bg-moss' : 'bg-ash-dim'"
        />
        {{ connected ? 'connectée' : 'déconnectée' }}
      </span>
    </div>

    <div
      ref="viewport"
      class="flex-1 overflow-y-auto px-3 py-2 font-mono text-[12px] leading-[1.6]"
      @scroll="onScroll"
    >
      <p v-if="!lines.length" class="text-ash-dim">
        {{ running ? 'En attente du journal…' : 'Ce serveur ne tourne pas.' }}
      </p>
      <p
        v-for="line in lines"
        :key="line.id"
        class="whitespace-pre-wrap break-words"
        :class="toneOf(line.kind)"
        style="animation: line-in 140ms ease-out"
      >
        {{ line.text }}
      </p>
    </div>

    <form class="flex items-center gap-2 border-t border-vein px-3 py-2" @submit.prevent="submit">
      <span class="font-mono text-[12px] text-torch">&gt;</span>
      <input
        v-model="input"
        :disabled="!connected"
        placeholder="say bonjour"
        aria-label="Commande à envoyer au serveur"
        class="min-w-0 flex-1 bg-transparent font-mono text-[12px] text-chalk placeholder:text-ash-dim/60 focus:outline-none disabled:opacity-50"
        @keydown.up.prevent="recall(-1)"
        @keydown.down.prevent="recall(1)"
      />
      <UiBtn type="submit" size="sm" :disabled="!connected || !input.trim()">
        Envoyer
      </UiBtn>
    </form>
  </div>
</template>
