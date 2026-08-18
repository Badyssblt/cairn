<script setup lang="ts">
definePageMeta({ layout: 'server' })
const { server } = useServerDetail()
useHead({ title: () => `Console — ${server.value?.name ?? 'Serveur'}` })
</script>

<template>
  <ServerSection title="Console" hint="Le journal en direct, et les commandes que tu lui envoies.">
    <ServerConsole
      v-if="server"
      :server-id="server.id"
      :running="server.state === 'running'"
    />
  </ServerSection>
</template>
