<script setup lang="ts">
definePageMeta({ layout: 'server' })
const { server } = useServerDetail()
useHead({ title: () => `Sauvegardes — ${server.value?.name ?? 'Serveur'}` })
</script>

<template>
  <ServerSection
    title="Sauvegardes"
    hint="La seule chose qui ne se refait pas, c'est un monde perdu."
  >
    <ServerBackups
      v-if="server"
      :server-id="server.id"
      :running="server.state === 'running'"
    />
  </ServerSection>
</template>
