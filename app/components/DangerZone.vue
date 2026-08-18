<script setup lang="ts">
import type { MinecraftServer } from '#shared/types'

const props = defineProps<{ server: MinecraftServer }>()

const purge = ref(false)
const confirmName = ref('')
const deleting = ref(false)
const error = ref<string | null>(null)

/**
 * Retaper le nom est demandé uniquement pour la suppression du monde.
 * Retirer un conteneur se refait ; effacer un monde, non.
 */
const needsConfirm = computed(() => purge.value)
const canDelete = computed(
  () => !needsConfirm.value || confirmName.value.trim() === props.server.name,
)

async function remove() {
  if (!canDelete.value) return
  deleting.value = true
  error.value = null
  try {
    await $fetch(`/api/servers/${props.server.id}?purge=${purge.value}`, {
      method: 'DELETE',
    })
    await navigateTo('/')
  } catch (e: any) {
    error.value = e?.data?.statusMessage ?? 'La suppression a échoué.'
    deleting.value = false
  }
}
</script>

<template>
  <div class="rounded-slab border border-redstone-dim/60 bg-redstone-dim/5 p-5">
    <h2 class="title-display text-[15px] text-chalk">Supprimer ce serveur</h2>
    <p class="mt-1.5 max-w-2xl text-[13px] text-ash">
      Le conteneur est retiré. Les fichiers du serveur, monde compris, sont conservés
      dans <span class="font-mono text-[12px] text-ash-dim">{{ server.id }}</span> sauf
      si tu demandes leur suppression.
    </p>

    <label class="mt-4 flex items-start gap-2.5">
      <input
        v-model="purge"
        type="checkbox"
        class="mt-0.5 h-4 w-4 shrink-0 rounded-[2px] border border-vein-lit bg-deepslate accent-redstone"
      />
      <span class="text-[13px] text-chalk">
        Supprimer aussi le monde et tous les fichiers
        <span class="mt-0.5 block text-[12px] text-ash-dim">
          Définitif. Il n'y a pas de corbeille.
        </span>
      </span>
    </label>

    <div v-if="needsConfirm" class="mt-4 max-w-sm">
      <UiField
        v-model="confirmName"
        label="Retape le nom du serveur pour confirmer"
        :placeholder="server.name"
        mono
      />
    </div>

    <p
      v-if="error"
      role="alert"
      class="mt-4 rounded-block border border-redstone-dim bg-redstone-dim/20 px-3 py-2 text-[12px] text-redstone"
    >
      {{ error }}
    </p>

    <UiBtn
      variant="danger"
      class="mt-5"
      :disabled="!canDelete || deleting"
      @click="remove"
    >
      {{
        deleting
          ? 'Suppression…'
          : purge
            ? 'Supprimer le serveur et le monde'
            : 'Supprimer le serveur'
      }}
    </UiBtn>
  </div>
</template>
