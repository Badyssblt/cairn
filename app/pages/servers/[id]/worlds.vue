<script setup lang="ts">
definePageMeta({ layout: 'server' })
const { server } = useServerDetail()
useHead({ title: () => `Monde — ${server.value?.name ?? 'Serveur'}` })
</script>

<template>
  <ServerSection
    title="Monde"
    hint="Les cartes présentes sur le serveur, les datapacks et le pack de ressources."
  >
    <ServerWorlds v-if="server" :server-id="server.id" :state="server.state" />
  </ServerSection>
</template>
