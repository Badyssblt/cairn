<script setup lang="ts">
import {
  AlertDialogRoot,
  AlertDialogPortal,
  AlertDialogOverlay,
  AlertDialogContent,
  AlertDialogTitle,
  AlertDialogDescription,
} from 'reka-ui'

/**
 * Confirmation pour une action définitive (changement de type, suppression…).
 * Un `AlertDialog` plutôt qu'un `Dialog` : il ne se ferme pas au clic à côté,
 * pour qu'une action de ce poids ne parte jamais d'un geste accidentel.
 */
const open = defineModel<boolean>('open', { default: false })

const props = withDefaults(
  defineProps<{
    title: string
    confirmLabel?: string
    disableConfirm?: boolean
    working?: boolean
  }>(),
  { confirmLabel: 'Confirmer', disableConfirm: false, working: false },
)

const emit = defineEmits<{ confirm: [] }>()
</script>

<template>
  <AlertDialogRoot v-model:open="open">
    <AlertDialogPortal>
      <AlertDialogOverlay class="fixed inset-0 z-[90] bg-deepslate/80 backdrop-blur-sm" />
      <AlertDialogContent
        class="fixed left-1/2 top-1/2 z-[91] w-[calc(100vw-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-slab border border-redstone-dim/60 bg-stone p-5 focus:outline-none"
      >
        <AlertDialogTitle class="title-display text-[15px] text-chalk">
          {{ props.title }}
        </AlertDialogTitle>
        <AlertDialogDescription as="div" class="mt-2 text-[13px] text-ash">
          <slot />
        </AlertDialogDescription>

        <div class="mt-5 flex justify-end gap-2">
          <UiBtn variant="ghost" :disabled="working" @click="open = false">Annuler</UiBtn>
          <UiBtn
            variant="danger"
            :disabled="disableConfirm || working"
            @click="emit('confirm')"
          >
            {{ working ? 'Un instant…' : confirmLabel }}
          </UiBtn>
        </div>
      </AlertDialogContent>
    </AlertDialogPortal>
  </AlertDialogRoot>
</template>
