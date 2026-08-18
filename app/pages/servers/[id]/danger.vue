<script setup lang="ts">
definePageMeta({ layout: 'server' })
const { server } = useServerDetail()
useHead({ title: () => `Zone de danger — ${server.value?.name ?? 'Serveur'}` })
</script>

<template>
  <ServerSection title="Zone de danger" hint="Les actions d'ici ne se rattrapent pas.">
    <DangerZone v-if="server" :server="server" />
  </ServerSection>
</template>
