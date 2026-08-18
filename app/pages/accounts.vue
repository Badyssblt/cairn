<script setup lang="ts">
useHead({ title: 'Comptes — Cairn' })

const { state } = useAuth()
const { data: users, refresh: refreshUsers } = await useFetch('/api/auth/users')

const newUsername = ref('')
const newPassword = ref('')
const creatingUser = ref(false)
const deletingUserId = ref<number | null>(null)
const usersMessage = ref<{ text: string; ok: boolean } | null>(null)

async function addUser() {
  creatingUser.value = true
  usersMessage.value = null
  try {
    await $fetch('/api/auth/users', {
      method: 'POST',
      body: { username: newUsername.value.trim(), password: newPassword.value },
    })
    newUsername.value = ''
    newPassword.value = ''
    await refreshUsers()
    usersMessage.value = { text: 'Compte créé.', ok: true }
  } catch (e: any) {
    usersMessage.value = { text: e?.data?.statusMessage ?? 'La création a échoué.', ok: false }
  } finally {
    creatingUser.value = false
  }
}

async function removeUser(id: number) {
  deletingUserId.value = id
  usersMessage.value = null
  try {
    await $fetch(`/api/auth/users/${id}`, { method: 'DELETE' })
    await refreshUsers()
    usersMessage.value = { text: 'Compte supprimé.', ok: true }
  } catch (e: any) {
    usersMessage.value = { text: e?.data?.statusMessage ?? 'La suppression a échoué.', ok: false }
  } finally {
    deletingUserId.value = null
  }
}
</script>

<template>
  <div>
    <header class="border-b border-vein px-5 py-5 lg:px-8">
      <p class="eyebrow">Panneau</p>
      <h1 class="title-display mt-1 text-2xl text-chalk">Comptes</h1>
    </header>

    <main class="px-5 py-6 lg:px-8">
      <section class="max-w-2xl">
        <p class="text-[13px] text-ash">
          Chaque compte a le même accès : piloter le panneau équivaut à piloter le
          démon Docker de l'hôte, il n'y a donc pas de rôle restreint.
        </p>

        <ul v-if="users?.users?.length" class="mt-4 space-y-2">
          <li
            v-for="u in users.users"
            :key="u.id"
            class="flex items-center justify-between rounded-block border border-vein bg-deepslate px-3 py-2"
          >
            <div>
              <p class="text-[13px] text-chalk">
                {{ u.username }}
                <span v-if="u.id === state.user?.id" class="text-[11px] text-ash-dim">(toi)</span>
              </p>
              <p class="text-[11px] text-ash-dim">
                Créé le {{ new Date(u.createdAt).toLocaleString('fr-FR') }}
              </p>
            </div>
            <UiBtn
              v-if="u.id !== state.user?.id && users.users.length > 1"
              variant="danger"
              size="sm"
              :disabled="deletingUserId === u.id"
              @click="removeUser(u.id)"
            >
              {{ deletingUserId === u.id ? 'Suppression…' : 'Supprimer' }}
            </UiBtn>
          </li>
        </ul>

        <form class="mt-5 max-w-sm space-y-3" @submit.prevent="addUser">
          <h2 class="eyebrow">Ajouter un administrateur</h2>
          <UiField v-model="newUsername" label="Identifiant" autocomplete="off" />
          <UiField
            v-model="newPassword"
            label="Mot de passe"
            type="password"
            autocomplete="new-password"
            hint="10 caractères minimum."
          />

          <p
            v-if="usersMessage"
            role="status"
            class="rounded-block border px-3 py-2 text-[12px]"
            :class="
              usersMessage.ok
                ? 'border-torch-dim bg-torch-dim/20 text-torch'
                : 'border-redstone-dim bg-redstone-dim/20 text-redstone'
            "
          >
            {{ usersMessage.text }}
          </p>

          <UiBtn type="submit" size="sm" :disabled="creatingUser">
            {{ creatingUser ? 'Création…' : 'Ajouter un administrateur' }}
          </UiBtn>
        </form>
      </section>
    </main>
  </div>
</template>
