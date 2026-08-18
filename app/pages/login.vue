<script setup lang="ts">
definePageMeta({ layout: 'blank' })

const { state, login, setup } = useAuth()

useHead({
  title: () => (state.value.needsSetup ? 'Installation — Cairn' : 'Connexion — Cairn'),
})

const username = ref('')
const password = ref('')
const error = ref<string | null>(null)
const pending = ref(false)

const isSetup = computed(() => state.value.needsSetup)

async function submit() {
  error.value = null
  pending.value = true
  try {
    if (isSetup.value) {
      await setup(username.value, password.value)
    } else {
      await login(username.value, password.value)
    }
    await navigateTo('/')
  } catch (e: any) {
    error.value =
      e?.data?.statusMessage ?? e?.statusMessage ?? 'La connexion a échoué.'
  } finally {
    pending.value = false
  }
}
</script>

<template>
  <main class="grid min-h-screen place-items-center px-5 py-10">
    <div class="w-full max-w-[340px]">
      <!-- La marque, seule et sans emphase : l'écran demande une chose. -->
      <div class="flex items-center gap-2.5">
        <span class="grid h-5 w-5 grid-cols-2 grid-rows-2 gap-[2px]">
          <span class="rounded-[1px] bg-torch" />
          <span class="rounded-[1px] bg-vein-lit" />
          <span class="rounded-[1px] bg-vein-lit" />
          <span class="rounded-[1px] bg-torch-dim" />
        </span>
        <span class="title-display text-[13px] tracking-wide text-chalk">
          Cairn
        </span>
      </div>

      <h1 class="title-display mt-7 text-xl text-chalk">
        {{ isSetup ? 'Crée le compte administrateur' : 'Connexion' }}
      </h1>
      <p class="mt-1 text-[13px] text-ash">
        {{
          isSetup
            ? 'Ce compte est le seul à pouvoir piloter tes serveurs. Il ne sera plus possible d’en créer un autre depuis cet écran.'
            : 'Identifie-toi pour accéder à Docker.'
        }}
      </p>

      <form class="mt-6 space-y-4" @submit.prevent="submit">
        <UiField
          v-model="username"
          label="Identifiant"
          autocomplete="username"
          autofocus
        />
        <UiField
          v-model="password"
          label="Mot de passe"
          type="password"
          :autocomplete="isSetup ? 'new-password' : 'current-password'"
          :hint="isSetup ? '10 caractères minimum.' : undefined"
        />

        <!-- L'erreur explique et donne la sortie. Elle ne s'excuse pas. -->
        <p
          v-if="error"
          role="alert"
          class="rounded-block border border-redstone-dim bg-redstone-dim/20 px-2.5 py-2 text-[12px] text-redstone"
        >
          {{ error }}
        </p>

        <UiBtn type="submit" variant="primary" :disabled="pending" class="w-full">
          {{
            pending
              ? 'Un instant…'
              : isSetup
                ? 'Créer le compte'
                : 'Se connecter'
          }}
        </UiBtn>
      </form>

      <p
        v-if="state.host"
        class="mt-8 border-t border-vein pt-3 font-mono text-[11px] text-ash-dim"
      >
        hôte&nbsp;: {{ state.host }}
      </p>
    </div>
  </main>
</template>
