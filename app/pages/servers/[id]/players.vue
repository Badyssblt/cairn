<script setup lang="ts">
definePageMeta({ layout: 'server' })
const { server } = useServerDetail()
useHead({ title: () => `Joueurs — ${server.value?.name ?? 'Serveur'}` })
</script>

<template>
  <ServerSection title="Joueurs" hint="Qui est connecté, qui peut entrer, qui est banni.">
    <ServerPlayers v-if="server" :server-id="server.id" />
  </ServerSection>
</template>
