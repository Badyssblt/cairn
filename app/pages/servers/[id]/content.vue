<script setup lang="ts">
definePageMeta({ layout: 'server' })
const { server } = useServerDetail()
useHead({ title: () => `Mods & plugins — ${server.value?.name ?? 'Serveur'}` })
</script>

<template>
  <ServerSection
    title="Mods & plugins"
    hint="Seul ce qui est compatible avec ce serveur est proposé."
  >
    <ContentBrowser
      v-if="server"
      :server-id="server.id"
      :state="server.state"
    />
  </ServerSection>
</template>
