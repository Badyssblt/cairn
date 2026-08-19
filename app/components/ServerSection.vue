<script setup lang="ts">
/** En-tête commun à toutes les sections d'un serveur. */
defineProps<{ title: string; hint?: string }>()
const { server, actionError, portConflict, busy, act } = useServerDetail()
</script>

<template>
  <div class="px-5 py-6 lg:px-8">
    <h1 class="title-display text-xl text-chalk">{{ title }}</h1>
    <p v-if="hint" class="mt-1 text-[13px] text-ash">{{ hint }}</p>

    <!-- Le diagnostic passe avant tout le reste : quand un serveur ne
         démarre pas, savoir pourquoi prime sur ce qu'on venait faire. -->
    <ServerDiagnosis
      v-if="server"
      :server-id="server.id"
      :state="server.state"
      class="mt-4"
    />

    <!-- Une boucle de redémarrage se voit de partout : c'est la panne la plus
         trompeuse, puisque Docker relance et que tout paraît « en marche ». -->
    <div
      v-if="server?.crashLooping"
      role="alert"
      class="mt-4 rounded-slab border border-redstone-dim bg-redstone-dim/15 p-4"
    >
      <p class="text-[14px] text-redstone">Ce serveur redémarre en boucle</p>
      <p class="mt-1.5 text-[13px] text-ash">
        Il s'arrête aussitôt lancé, et Docker le relance —
        {{ server.restartCount }} fois jusqu'ici. Ouvre la console&nbsp;: la
        dernière erreur avant l'arrêt dit pourquoi.
      </p>
      <div class="mt-3 flex flex-wrap gap-2">
        <UiBtn size="sm" :to="`/servers/${server.id}/console`">Voir la console</UiBtn>
        <UiBtn size="sm" variant="ghost" :disabled="busy" @click="act('stop')">
          Arrêter la boucle
        </UiBtn>
      </div>
    </div>

    <div
      v-if="actionError"
      role="alert"
      class="mt-4 flex flex-wrap items-center gap-2.5 rounded-block border border-redstone-dim bg-redstone-dim/20 px-3 py-2 text-[12px] text-redstone"
    >
      <span>{{ actionError }}</span>
      <UiBtn
        v-if="portConflict"
        size="sm"
        variant="ghost"
        :disabled="busy"
        @click="act('start', true)"
      >
        Arrêter « {{ portConflict.conflictName }} » et démarrer
      </UiBtn>
    </div>
    <p
      v-if="server?.installError"
      role="alert"
      class="mt-4 rounded-block border border-redstone-dim bg-redstone-dim/20 px-3 py-2 text-[12px] text-redstone"
    >
      L'installation du modpack a échoué : {{ server.installError }}
    </p>

    <div class="mt-5">
      <slot />
    </div>
  </div>
</template>
