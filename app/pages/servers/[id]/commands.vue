<script setup lang="ts">
definePageMeta({ layout: 'server' })
const { server } = useServerDetail()
useHead({ title: () => `Commandes — ${server.value?.name ?? 'Serveur'}` })
</script>

<template>
  <ServerSection
    title="Commandes"
    hint="Qui a fait quoi : /give, /kill, /gamemode… tel que le serveur les rapporte lui-même."
  >
    <ServerCommandLog v-if="server" :server-id="server.id" />
  </ServerSection>
</template>
