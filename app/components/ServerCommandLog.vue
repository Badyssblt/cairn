<script setup lang="ts">
const props = defineProps<{ serverId: string }>()

interface Entry {
  id: number
  player: string
  verb: string
  detail: string
  createdAt: number
}
interface Summary {
  player: string
  verb: string
  count: number
  lastAt: number
}

const { data, pending } = await useFetch<{ entries: Entry[]; summary: Summary[] }>(
  () => `/api/servers/${props.serverId}/commands`,
)

/** Étiquette lisible pour chaque famille de commande détectée. */
const VERB_LABELS: Record<string, string> = {
  give: 'Objet donné',
  kill: 'Joueur tué',
  gamemode: 'Mode de jeu',
  teleport: 'Téléportation',
  time: 'Heure changée',
  weather: 'Météo changée',
  op: 'Passage opérateur',
  deop: 'Retrait opérateur',
  whitelist: 'Liste blanche',
  ban: 'Bannissement',
  pardon: 'Grâce',
  kick: 'Expulsion',
  enchant: 'Enchantement',
  effect: 'Effet',
  xp: 'Expérience',
  clear: 'Inventaire vidé',
  summon: 'Invocation',
  difficulty: 'Difficulté',
  gamerule: 'Règle de jeu',
  spawnpoint: "Point d'apparition",
  other: 'Autre',
}
const verbLabel = (v: string) => VERB_LABELS[v] ?? v

/** « Rcon » est le nom que Minecraft donne aux commandes passées par le
 *  panneau (console, tâches planifiées) : on l'affiche en toutes lettres
 *  plutôt que de laisser croire à un joueur nommé « Rcon ». */
const displayName = (player: string) => (player.toLowerCase() === 'rcon' ? 'Console (panneau)' : player)

const summary = computed(() => data.value?.summary ?? [])
const entries = computed(() => data.value?.entries ?? [])

// Le journal avance en continu côté serveur : un simple sondage suffit à le
// garder à jour sans ouvrir de flux dédié.
onMounted(() => {
  const timer = setInterval(async () => {
    data.value = await $fetch<{ entries: Entry[]; summary: Summary[] }>(
      `/api/servers/${props.serverId}/commands`,
    )
  }, 15_000)
  onBeforeUnmount(() => clearInterval(timer))
})
</script>

<template>
  <div class="space-y-5">
    <!-- Résumé : qui a fait quoi, combien de fois -->
    <section class="rounded-slab border border-vein">
      <header class="border-b border-vein px-4 py-2.5">
        <h3 class="eyebrow">Résumé par joueur</h3>
      </header>

      <p v-if="pending" class="px-4 py-6 text-center text-[13px] text-ash-dim">Lecture…</p>
      <p v-else-if="!summary.length" class="px-4 py-6 text-center text-[13px] text-ash-dim">
        Aucune commande enregistrée pour l'instant. Les commandes exécutées en jeu ou depuis
        la console apparaîtront ici dès qu'un joueur op en lancera une.
      </p>
      <div v-else class="divide-y divide-vein">
        <div
          v-for="s in summary"
          :key="`${s.player}:${s.verb}`"
          class="flex items-center gap-3 px-4 py-2.5"
        >
          <span class="w-32 shrink-0 truncate text-[13px] text-chalk">{{ displayName(s.player) }}</span>
          <span class="rounded-block border border-vein px-2 py-0.5 font-mono text-[11px] text-ash">
            /{{ s.verb === 'other' ? '?' : s.verb }}
          </span>
          <span class="flex-1 truncate text-[12px] text-ash-dim">{{ verbLabel(s.verb) }}</span>
          <span class="font-mono text-[13px] text-torch">{{ s.count }}×</span>
          <span class="w-20 shrink-0 text-right font-mono text-[11px] text-ash-dim">
            {{ formatRelativeTime(s.lastAt) }}
          </span>
        </div>
      </div>
    </section>

    <!-- Détail chronologique -->
    <section class="rounded-slab border border-vein">
      <header class="flex items-center justify-between border-b border-vein px-4 py-2.5">
        <h3 class="eyebrow">Journal</h3>
        <span class="font-mono text-[11px] text-ash-dim">{{ entries.length }} ligne(s)</span>
      </header>

      <p v-if="!pending && !entries.length" class="px-4 py-6 text-center text-[13px] text-ash-dim">
        Rien à montrer pour l'instant.
      </p>
      <div v-else class="max-h-[520px] divide-y divide-vein overflow-y-auto">
        <div v-for="e in entries" :key="e.id" class="flex items-start gap-3 px-4 py-2 text-[12px]">
          <span class="w-14 shrink-0 font-mono text-ash-dim">
            {{ new Date(e.createdAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) }}
          </span>
          <span class="w-28 shrink-0 truncate text-chalk">{{ displayName(e.player) }}</span>
          <span class="w-24 shrink-0 truncate font-mono text-ash">/{{ e.verb === 'other' ? '?' : e.verb }}</span>
          <span class="flex-1 truncate text-ash-dim" :title="e.detail">{{ e.detail }}</span>
        </div>
      </div>
    </section>

    <p class="text-[11px] text-ash-dim">
      Ce journal reprend le retour que Minecraft affiche lui-même aux opérateurs : il ne
      capte que ce qui se passe pendant que le serveur tourne, et seulement si le gamerule
      <code class="font-mono">sendCommandFeedback</code> reste activé (c'est le réglage par
      défaut).
    </p>
  </div>
</template>
