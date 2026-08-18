<script setup lang="ts">
useHead({ title: 'Réglages — Cairn' })

const { data, refresh } = await useFetch('/api/settings')

const publicHost = ref('')
const discordWebhook = ref('')
const totalGb = ref(0)
const reserveGb = ref(0)

watchEffect(() => {
  if (!data.value) return
  publicHost.value = data.value.publicHost ?? ''
  totalGb.value = Math.round((data.value.hostRamTotalMb / 1024) * 10) / 10
  reserveGb.value = Math.round((data.value.hostRamReserveMb / 1024) * 10) / 10
})

const saving = ref(false)
const message = ref<{ text: string; ok: boolean } | null>(null)

async function testNotify() {
  message.value = null
  try {
    await $fetch('/api/settings/test-notify', { method: 'POST' })
    message.value = { text: 'Message envoyé — regarde ton salon Discord.', ok: true }
  } catch (e: any) {
    message.value = { text: e?.data?.statusMessage ?? "L'envoi a échoué.", ok: false }
  }
}

async function save() {
  saving.value = true
  message.value = null
  try {
    await $fetch('/api/settings', {
      method: 'PUT',
      body: {
        publicHost: publicHost.value.trim(),
        ...(discordWebhook.value.trim() ? { discordWebhook: discordWebhook.value.trim() } : {}),
        hostRamTotalMb: Math.round(totalGb.value * 1024),
        hostRamReserveMb: Math.round(reserveGb.value * 1024),
      },
    })
    discordWebhook.value = ''
    await refresh()
    message.value = { text: 'Réglages enregistrés.', ok: true }
  } catch (e: any) {
    message.value = {
      text: e?.data?.statusMessage ?? "L'enregistrement a échoué.",
      ok: false,
    }
  } finally {
    saving.value = false
  }
}

</script>

<template>
  <div>
    <header class="border-b border-vein px-5 py-5 lg:px-8">
      <p class="eyebrow">Panneau</p>
      <h1 class="title-display mt-1 text-2xl text-chalk">Réglages</h1>
    </header>

    <main class="px-5 py-6 lg:px-8">
      <form class="space-y-8" @submit.prevent="save">
        <section>
          <h2 class="eyebrow">Adresse publique</h2>
          <p class="mt-1.5 text-[13px] text-ash">
            Ce que tes joueurs saisissent pour te rejoindre. Sans ça, le panneau
            affiche le nom de la machine, que personne ne peut utiliser depuis
            l'extérieur.
          </p>
          <div class="mt-3 max-w-sm">
            <UiField
              v-model="publicHost"
              label="Domaine ou IP publique"
              placeholder="jeux.mondomaine.fr"
              mono
              hint="Laisse vide pour utiliser l'IP publique détectée automatiquement."
            />
          </div>
        </section>

        <section>
          <h2 class="eyebrow">Alertes Discord</h2>
          <p class="mt-1.5 text-[13px] text-ash">
            Pour être prévenu quand un serveur tombe ou qu'une sauvegarde échoue,
            sans avoir à regarder le panneau.
          </p>
          <div class="mt-3 max-w-lg">
            <UiField
              v-model="discordWebhook"
              label="Adresse du webhook"
              type="password"
              mono
              :placeholder="data?.discordWebhook ? '•••••••• (déjà enregistrée)' : 'https://discord.com/api/webhooks/…'"
              :hint="data?.discordWebhook ? 'Laisse vide pour conserver celle enregistrée.' : 'Se crée dans les réglages d’un salon Discord.'"
            />
            <UiBtn v-if="data?.discordWebhook" size="sm" class="mt-2" @click="testNotify">
              Envoyer un message d'essai
            </UiBtn>
          </div>
        </section>

        <section>
          <h2 class="eyebrow">Capacité de l'hôte</h2>
          <p class="mt-1.5 text-[13px] text-ash">
            Ce que le panneau s'autorise à allouer. La réserve reste au système : elle
            n'est jamais proposée à un serveur.
          </p>

          <div class="mt-3 grid max-w-lg gap-4 sm:grid-cols-2">
            <UiField v-model.number="totalGb" label="Mémoire totale (Go)" type="number" mono />
            <UiField v-model.number="reserveGb" label="Réserve système (Go)" type="number" mono />
          </div>

          <p v-if="data?.capacity" class="mt-3 font-mono text-[11px] text-ash-dim">
            {{ formatGb(data.capacity.allocatedMb) }} Go alloués ·
            {{ formatGb(data.capacity.freeMb) }} Go libres
          </p>
        </section>

        <section>
          <h2 class="eyebrow">Emplacement des données</h2>
          <p class="mt-1.5 font-mono text-[12px] text-chalk">{{ data?.dataRoot }}</p>
          <p class="mt-1 text-[11px] text-ash-dim">
            Défini au démarrage par NUXT_DATA_ROOT. Chaque serveur y reçoit son
            propre dossier.
          </p>
        </section>

        <p
          v-if="message"
          role="status"
          class="rounded-block border px-3 py-2 text-[12px]"
          :class="
            message.ok
              ? 'border-torch-dim bg-torch-dim/20 text-torch'
              : 'border-redstone-dim bg-redstone-dim/20 text-redstone'
          "
        >
          {{ message.text }}
        </p>

        <div class="border-t border-vein pt-5">
          <UiBtn type="submit" variant="primary" :disabled="saving">
            {{ saving ? 'Enregistrement…' : 'Enregistrer' }}
          </UiBtn>
        </div>
      </form>
    </main>
  </div>
</template>
