<script setup lang="ts">
import { SERVER_TYPES, COMMON_MC_VERSIONS, type ServerType } from '#shared/types'
import type { ModpackSelection } from '~/components/ModpackPicker.vue'

useHead({ title: 'Créer un serveur — Cairn' })

const { data: settings } = await useFetch('/api/settings')
const { data: existing } = await useFetch('/api/servers')
const { data: catalog } = await useFetch('/api/games')

interface GameField {
  key: string
  label: string
  hint?: string
  type: 'text' | 'password' | 'number' | 'select'
  required?: boolean
  default?: string
}
interface GameInfo {
  id: string
  name: string
  tagline: string
  defaultPort: number
  defaultMemoryGb: number
  fields: GameField[]
  hasConsole: boolean
  contentSources: string[]
  versionSelectable: boolean
  steamName: string | null
}

const games = computed<GameInfo[]>(() => catalog.value?.games ?? [])
const gameId = ref('minecraft')
const game = computed(() => games.value.find((g) => g.id === gameId.value) ?? null)

/** Minecraft est le seul jeu à disposer de catalogues de contenu intégrés. */
const isMinecraft = computed(() => gameId.value === 'minecraft')
const isGeneric = computed(() => gameId.value === 'linuxgsm')

/**
 * Le catalogue LinuxGSM, chargé seulement si on en a besoin : 140 entrées
 * n'ont pas à voyager quand on crée un serveur Minecraft.
 */
const lgsmGames = ref<{ shortname: string; gameservername: string; name: string }[]>([])
const lgsmQuery = ref('')

/**
 * Visuels officiels, résolus par nom chez Steam.
 *
 * On ne demande que ce qui est affiché : résoudre 140 jeux d'un coup ferait
 * autant de requêtes pour une douzaine de vignettes visibles.
 */
const art = ref<Record<string, { icon: string | null }>>({})

async function loadArt(names: string[]) {
  const missing = names.filter((n) => !(n in art.value))
  if (!missing.length) return
  try {
    const res = await $fetch<{ art: Record<string, { icon: string | null }> }>(
      '/api/games/art',
      { query: { names: missing.join('|') } },
    )
    art.value = { ...art.value, ...res.art }
  } catch {
    // Sans visuel on retombe sur la marque dessinée : rien de bloquant.
  }
}

watch(isGeneric, async (on) => {
  if (!on || lgsmGames.value.length) return
  try {
    const res = await $fetch<{ games: { shortname: string; name: string }[] }>(
      '/api/games/linuxgsm',
    )
    lgsmGames.value = res.games
  } catch {
    lgsmGames.value = []
  }
})

const lgsmMatches = computed(() => {
  const q = lgsmQuery.value.trim().toLowerCase()
  if (!q) return lgsmGames.value.slice(0, 12)
  return lgsmGames.value
    .filter((g) => g.name.toLowerCase().includes(q) || g.shortname.includes(q))
    .slice(0, 12)
})

watch(lgsmMatches, (list) => loadArt(list.map((g) => g.name)), { immediate: true })
watch(
  games,
  (list) => loadArt(list.map((g) => g.steamName).filter((n): n is string => Boolean(n))),
  { immediate: true },
)

/** Choisir dans la liste renseigne aussi le nom de service, dont dépend la config. */
function pickLgsm(g: { shortname: string; gameservername: string }) {
  options.value.shortname = g.shortname
  options.value.gameservername = g.gameservername
}

/** Réglages propres au jeu choisi. */
const options = ref<Record<string, string>>({})

function pickGame(id: string) {
  if (gameId.value === id) return
  gameId.value = id
  const g = games.value.find((x) => x.id === id)
  if (!g) return
  memoryGb.value = g.defaultMemoryGb
  options.value = Object.fromEntries(g.fields.map((f) => [f.key, f.default ?? '']))
  allocatePort()
}

const name = ref('')
const type = ref<ServerType>('PAPER')
const mcVersion = ref('LATEST')
const memoryGb = ref(4)
const hostPort = ref(25565)
const modpack = ref<ModpackSelection | null>(null)
const cpuLimit = ref(0)
const diskLimitGb = ref(0)

const creating = ref(false)
const error = ref<string | null>(null)

const isModpack = computed(() => type.value === 'MODPACK')

/**
 * Le premier port libre à partir de celui que le jeu propose.
 *
 * Certains jeux prennent plusieurs ports consécutifs (Valheim en occupe
 * trois) : on avance par pas de trois pour laisser la place aux voisins.
 */
function allocatePort() {
  const taken = new Set((existing.value?.servers ?? []).map((s) => s.hostPort))
  let p = game.value?.defaultPort ?? 25565
  while (taken.has(p)) p += 3
  hostPort.value = p
}
watchEffect(() => {
  if (games.value.length) allocatePort()
})

const freeGb = computed(() =>
  settings.value?.capacity ? settings.value.capacity.freeMb / 1024 : null,
)
const overCapacity = computed(
  () => freeGb.value !== null && memoryGb.value > freeGb.value,
)

/** Paliers usuels, avec ce à quoi ils correspondent concrètement. */
const MEMORY_PRESETS = [
  { gb: 2, label: '2 Go', hint: 'Quelques amis, sans mods' },
  { gb: 4, label: '4 Go', hint: 'Petit serveur ou pack léger' },
  { gb: 6, label: '6 Go', hint: 'Modpack classique' },
  { gb: 8, label: '8 Go', hint: 'Gros modpack' },
]

const canSubmit = computed(() => {
  if (!name.value.trim() || creating.value || overCapacity.value) return false
  // Un réglage obligatoire manquant ferait échouer le démarrage : autant
  // bloquer ici, où l'utilisateur peut encore corriger.
  for (const f of game.value?.fields ?? []) {
    if (f.required && !options.value[f.key]?.trim()) return false
  }
  if (isMinecraft.value && isModpack.value) return Boolean(modpack.value?.project)
  return true
})

/** Ce que le récapitulatif annonce doit être ce qui sera réellement créé. */
const summary = computed(() => {
  if (!isMinecraft.value) return game.value?.name ?? ''
  if (isModpack.value) return modpack.value?.name ?? 'Modpack à choisir'
  const t = SERVER_TYPES.find((t) => t.value === type.value)
  const v = mcVersion.value === 'LATEST' ? 'dernière version' : mcVersion.value
  return `${t?.label} · ${v}`
})

async function submit() {
  if (!canSubmit.value) return
  creating.value = true
  error.value = null
  try {
    const res = await $fetch('/api/servers', {
      method: 'POST',
      body: {
        game: gameId.value,
        options: options.value,
        name: name.value.trim(),
        type: isMinecraft.value ? type.value : undefined,
        mcVersion: isModpack.value ? 'LATEST' : mcVersion.value.trim() || 'LATEST',
        memoryMb: Math.round(memoryGb.value * 1024),
        hostPort: hostPort.value,
        modpackSource: modpack.value?.source ?? null,
        modpackProject: modpack.value?.project ?? null,
        modpackVersion: modpack.value?.version ?? null,
        modpackLoader: modpack.value?.loader ?? null,
        modpackName: modpack.value?.name ?? null,
        modpackIcon: modpack.value?.iconUrl ?? null,
        cpuLimit: cpuLimit.value > 0 ? cpuLimit.value : null,
        diskLimitMb: diskLimitGb.value > 0 ? Math.round(diskLimitGb.value * 1024) : null,
      },
    })
    await navigateTo(`/servers/${res.server.id}`)
  } catch (e: any) {
    error.value = e?.data?.statusMessage ?? "Le serveur n'a pas pu être créé."
    creating.value = false
  }
}
</script>

<template>
  <div class="pb-28">
    <main class="mx-auto max-w-3xl px-5 py-8">
      <NuxtLink to="/" class="eyebrow hover:text-ash">← Le rack</NuxtLink>
      <h1 class="title-display mt-1 text-2xl text-chalk">Créer un serveur</h1>

      <form class="mt-8 space-y-9" @submit.prevent="submit">
        <!-- 1 · Le jeu : c'est lui qui détermine tout le formulaire -->
        <section>
          <h2 class="eyebrow">Quel jeu ?</h2>
          <div class="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            <button
              v-for="g in games"
              :key="g.id"
              type="button"
              class="group flex flex-col gap-2 rounded-slab border p-3.5 text-left transition-colors"
              :class="
                gameId === g.id
                  ? 'border-torch bg-torch-dim/15'
                  : 'border-vein bg-stone/40 hover:border-vein-lit hover:bg-stone-lit'
              "
              @click="pickGame(g.id)"
            >
              <!-- Boîte de taille fixe : sans elle, une carte à icône
                   dessinée décalerait son titre par rapport aux voisines. -->
              <span class="grid h-8 w-8 shrink-0 place-items-center">
                <img
                  v-if="g.steamName && art[g.steamName]?.icon"
                  :src="art[g.steamName]!.icon!"
                  alt=""
                  loading="lazy"
                  width="32"
                  height="32"
                  class="h-8 w-8 rounded-[3px]"
                />
                <GameIcon
                  v-else
                  :game="g.id"
                  class="h-7 w-7"
                  :class="gameId === g.id ? 'text-torch' : 'text-ash group-hover:text-chalk'"
                />
              </span>
              <span>
                <span class="block text-[14px] text-chalk">{{ g.name }}</span>
                <span class="mt-0.5 block text-[12px] leading-snug text-ash">{{ g.tagline }}</span>
              </span>
            </button>
          </div>
        </section>

        <!-- 2 · Minecraft : le type de serveur -->
        <section v-if="isMinecraft">
          <h2 class="eyebrow">Quel type de serveur ?</h2>

          <div class="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            <button
              v-for="t in SERVER_TYPES"
              :key="t.value"
              type="button"
              class="group relative flex flex-col gap-2 rounded-slab border p-3.5 text-left transition-colors"
              :class="
                type === t.value
                  ? 'border-torch bg-torch-dim/15'
                  : 'border-vein bg-stone/40 hover:border-vein-lit hover:bg-stone-lit'
              "
              @click="type = t.value"
            >
              <span
                v-if="t.badge"
                class="absolute right-2.5 top-2.5 rounded-[3px] px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider"
                :class="type === t.value ? 'bg-torch text-deepslate' : 'bg-vein text-ash'"
              >
                {{ t.badge }}
              </span>

              <ServerTypeIcon
                :type="t.value"
                class="h-6 w-6"
                :class="type === t.value ? 'text-torch' : 'text-ash group-hover:text-chalk'"
              />
              <span>
                <span class="block text-[14px] text-chalk">{{ t.label }}</span>
                <span class="mt-0.5 block text-[12px] leading-snug text-ash">{{ t.hint }}</span>
              </span>
            </button>
          </div>
        </section>

        <!-- 3 · Ce que le type implique -->
        <section v-if="isMinecraft && isModpack">
          <h2 class="eyebrow">Choisis ton modpack</h2>
          <div class="mt-3">
            <ModpackPicker v-model="modpack" />
          </div>
        </section>

        <section v-else-if="isMinecraft">
          <h2 class="eyebrow">Version de Minecraft</h2>
          <p class="mt-1.5 text-[13px] text-ash">
            Tes joueurs devront utiliser cette version pour se connecter.
          </p>

          <div class="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              class="rounded-block border px-3 py-1.5 text-[13px] transition-colors"
              :class="
                mcVersion === 'LATEST'
                  ? 'border-torch bg-torch-dim/15 text-chalk'
                  : 'border-vein bg-stone/40 text-ash hover:text-chalk'
              "
              @click="mcVersion = 'LATEST'"
            >
              Dernière version
            </button>
            <button
              v-for="v in COMMON_MC_VERSIONS"
              :key="v"
              type="button"
              class="rounded-block border px-3 py-1.5 font-mono text-[13px] transition-colors"
              :class="
                mcVersion === v
                  ? 'border-torch bg-torch-dim/15 text-chalk'
                  : 'border-vein bg-stone/40 text-ash hover:text-chalk'
              "
              @click="mcVersion = v"
            >
              {{ v }}
            </button>
          </div>
        </section>

        <!-- 3 · Le jeu générique : on choisit dans la liste LinuxGSM -->
        <section v-if="isGeneric">
          <h2 class="eyebrow">Quel jeu exactement ?</h2>
          <p class="mt-1.5 text-[13px] text-ash">
            Cherche dans les {{ lgsmGames.length || '140' }} jeux pris en charge.
            Choisir ici remplit le nom court plus bas.
          </p>
          <input
            v-model="lgsmQuery"
            placeholder="Rust, ARK, Garry's Mod…"
            aria-label="Chercher un jeu"
            class="mt-3 h-9 w-full max-w-md rounded-block border border-vein bg-deepslate px-2.5 text-[13px] text-chalk placeholder:text-ash-dim/70 focus:border-torch focus:outline-none"
          />
          <div class="mt-2 flex flex-wrap gap-1.5">
            <button
              v-for="g in lgsmMatches"
              :key="g.shortname"
              type="button"
              class="flex items-center gap-2 rounded-block border p-1.5 pr-2.5 text-left text-[12px] transition-colors"
              :class="
                options.shortname === g.shortname
                  ? 'border-torch bg-torch-dim/15 text-chalk'
                  : 'border-vein bg-stone/40 text-ash hover:text-chalk'
              "
              @click="pickLgsm(g)"
            >
              <!-- Les entrées de la liste n'ont qu'un nom : c'est lui qui
                   sert de clé pour l'icône. -->
              <span class="grid h-8 w-8 shrink-0 place-items-center">
                <img
                  v-if="art[g.name]?.icon"
                  :src="art[g.name]!.icon!"
                  alt=""
                  loading="lazy"
                  width="32"
                  height="32"
                  class="h-8 w-8 rounded-[3px]"
                />
                <GameIcon v-else game="other" class="h-5 w-5 text-ash-dim" />
              </span>
              <span>
                {{ g.name }}
                <span class="block font-mono text-[10px] text-ash-dim">{{ g.shortname }}</span>
              </span>
            </button>
          </div>
        </section>

        <!-- 3 bis · Les réglages que le jeu réclame -->
        <section v-if="game?.fields.length">
          <h2 class="eyebrow">Réglages de {{ game.name }}</h2>
          <p class="mt-1.5 text-[13px] text-ash">
            Ce que {{ game.name }} demande pour démarrer.
          </p>
          <div class="mt-3 grid max-w-xl gap-4 sm:grid-cols-2">
            <UiField
              v-for="f in game.fields"
              :key="f.key"
              v-model="options[f.key]"
              :label="f.label + (f.required ? ' *' : '')"
              :type="f.type === 'select' ? 'text' : f.type"
              :hint="f.hint"
            />
          </div>
        </section>

        <!-- 4 · Le nom -->
        <section>
          <h2 class="eyebrow">Nom du serveur</h2>
          <p class="mt-1.5 text-[13px] text-ash">
            Pour t'y retrouver quand tu en auras plusieurs.
          </p>
          <input
            v-model="name"
            placeholder="Serveur des copains"
            aria-label="Nom du serveur"
            class="mt-3 h-10 w-full max-w-sm rounded-block border border-vein bg-deepslate px-3 text-[14px] text-chalk placeholder:text-ash-dim/70 focus:border-torch focus:outline-none"
          />
        </section>

        <!-- 4 · La mémoire, en paliers parlants -->
        <section>
          <h2 class="eyebrow">Mémoire</h2>
          <p class="mt-1.5 text-[13px] text-ash">
            Plus il y a de mods et de joueurs, plus il en faut.
            <template v-if="freeGb !== null">
              Il te reste
              <span class="text-chalk">{{ freeGb.toFixed(1).replace('.', ',') }} Go</span>
              disponibles.
            </template>
          </p>

          <div class="mt-3 flex flex-wrap gap-2">
            <button
              v-for="p in MEMORY_PRESETS"
              :key="p.gb"
              type="button"
              :disabled="freeGb !== null && p.gb > freeGb"
              class="rounded-block border px-3 py-2 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-35"
              :class="
                memoryGb === p.gb
                  ? 'border-torch bg-torch-dim/15'
                  : 'border-vein bg-stone/40 hover:border-vein-lit'
              "
              @click="memoryGb = p.gb"
            >
              <span class="block font-mono text-[13px] text-chalk">{{ p.label }}</span>
              <span class="block text-[11px] text-ash-dim">{{ p.hint }}</span>
            </button>

            <label class="flex items-center gap-2 rounded-block border border-vein bg-stone/40 px-3">
              <span class="text-[12px] text-ash-dim">Autre</span>
              <input
                v-model.number="memoryGb"
                type="number"
                min="0.5"
                step="0.5"
                aria-label="Mémoire personnalisée en Go"
                class="w-14 bg-transparent py-2 font-mono text-[13px] text-chalk focus:outline-none"
              />
              <span class="text-[12px] text-ash-dim">Go</span>
            </label>
          </div>

          <p v-if="overCapacity" class="mt-2 text-[12px] text-redstone">
            C'est plus que ce qui reste. Choisis une valeur inférieure, ou arrête un
            autre serveur pour libérer de la place.
          </p>
        </section>

        <!-- 5 · Les garde-fous, facultatifs -->
        <section>
          <h2 class="eyebrow">Limites (facultatif)</h2>
          <p class="mt-1.5 text-[13px] text-ash">
            Laisse à 0 pour ne rien limiter.
          </p>
          <div class="mt-3 grid max-w-lg gap-4 sm:grid-cols-2">
            <UiField
              v-model.number="cpuLimit"
              label="Processeur (cœurs)"
              type="number"
              mono
              hint="Plafond réel : le serveur ne dépassera pas cette part."
            />
            <UiField
              v-model.number="diskLimitGb"
              label="Disque (Go)"
              type="number"
              mono
              hint="Seuil d'alerte, pas une barrière : Docker ne peut pas limiter un dossier monté."
            />
          </div>
        </section>

        <!-- 6 · L'adresse, telle que les joueurs la verront -->
        <section>
          <h2 class="eyebrow">Adresse de connexion</h2>
          <p class="mt-1.5 text-[13px] text-ash">
            C'est ce que tes joueurs saisiront dans Minecraft.
          </p>
          <div class="mt-3 flex flex-wrap items-center gap-3">
            <code
              class="rounded-block border border-vein bg-deepslate px-3 py-2 font-mono text-[13px] text-chalk"
            >
              {{ settings?.host || 'ton-serveur' }}:{{ hostPort }}
            </code>
            <label class="flex items-center gap-2 text-[12px] text-ash-dim">
              Port
              <input
                v-model.number="hostPort"
                type="number"
                aria-label="Port"
                class="h-9 w-24 rounded-block border border-vein bg-deepslate px-2.5 font-mono text-[13px] text-chalk focus:border-torch focus:outline-none"
              />
            </label>
          </div>
        </section>

        <p
          v-if="game && !game.hasConsole"
          class="rounded-block border border-vein bg-stone/40 px-3 py-2 text-[12px] text-ash"
        >
          {{ game.name }} ne permet pas d'envoyer des commandes à distance :
          la console affichera le journal, sans zone de saisie.
        </p>

        <p
          v-if="error"
          role="alert"
          class="rounded-block border border-redstone-dim bg-redstone-dim/20 px-3 py-2 text-[13px] text-redstone"
        >
          {{ error }}
        </p>
      </form>
    </main>

    <!-- Récapitulatif : ce qu'on s'apprête à créer reste sous les yeux -->
    <div class="fixed inset-x-0 bottom-0 z-20 border-t border-vein bg-deepslate/95 backdrop-blur">
      <div class="mx-auto flex max-w-3xl flex-wrap items-center gap-x-6 gap-y-2 px-5 py-3">
        <div class="min-w-0 flex-1">
          <p class="truncate text-[13px] text-chalk">
            {{ name.trim() || 'Serveur sans nom' }}
          </p>
          <p class="truncate font-mono text-[11px] text-ash-dim">
            {{ summary }} · {{ String(memoryGb).replace('.', ',') }} Go · port {{ hostPort }}
          </p>
        </div>

        <UiBtn variant="primary" :disabled="!canSubmit" @click="submit">
          {{ creating ? 'Création…' : 'Créer le serveur' }}
        </UiBtn>
      </div>

      <p v-if="creating && isModpack" class="pb-3 text-center text-[12px] text-ash-dim">
        Le modpack se télécharge, cela prend quelques minutes.
      </p>
    </div>
  </div>
</template>
