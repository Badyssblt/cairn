<script setup lang="ts">
definePageMeta({ layout: 'server' })
const { server } = useServerDetail()
useHead({ title: () => `Fichiers — ${server.value?.name ?? 'Serveur'}` })
</script>

<template>
  <ServerSection
    title="Fichiers"
    hint="Les fichiers du serveur. Redémarre après une modification pour l'appliquer."
  >
    <ServerFiles v-if="server" :server-id="server.id" />
  </ServerSection>
</template>
