<script setup lang="ts">
definePageMeta({ layout: 'server' })
const { server } = useServerDetail()
useHead({ title: () => `Tâches planifiées — ${server.value?.name ?? 'Serveur'}` })
</script>

<template>
  <ServerSection
    title="Tâches planifiées"
    hint="Ce que le serveur fait tout seul, à heure fixe."
  >
    <ServerSchedules v-if="server" :server-id="server.id" />
  </ServerSection>
</template>
