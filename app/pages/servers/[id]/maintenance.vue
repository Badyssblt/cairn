<script setup lang="ts">
definePageMeta({ layout: 'server' })
const { server } = useServerDetail()
useHead({ title: () => `Entretien — ${server.value?.name ?? 'Serveur'}` })
</script>

<template>
  <ServerSection title="Entretien" hint="Faire de la place, dupliquer, repartir à zéro.">
    <ServerMaintenance v-if="server" :server="server" />
  </ServerSection>
</template>
