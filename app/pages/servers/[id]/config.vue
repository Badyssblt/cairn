<script setup lang="ts">
definePageMeta({ layout: 'server' })
const { server } = useServerDetail()
useHead({ title: () => `Configuration — ${server.value?.name ?? 'Serveur'}` })
</script>

<template>
  <ServerSection
    title="Configuration"
    hint="Les réglages du monde et du jeu, lus au démarrage du serveur."
  >
    <PropertiesEditor v-if="server" :server-id="server.id" />
  </ServerSection>
</template>
