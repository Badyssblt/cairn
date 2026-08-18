<script setup lang="ts">
/**
 * Champ de saisie. Le champ est *creusé* : il descend sous la surface du
 * panneau au lieu de flotter au-dessus. Même logique de strates que le reste.
 */
const model = defineModel<string | number>()

withDefaults(
  defineProps<{
    label: string
    hint?: string
    type?: string
    placeholder?: string
    mono?: boolean
    autocomplete?: string
    autofocus?: boolean
    min?: number
    max?: number
  }>(),
  { type: 'text' },
)

const id = useId()
</script>

<template>
  <div>
    <label :for="id" class="eyebrow block">{{ label }}</label>
    <input
      :id="id"
      v-model="model"
      :type="type"
      :placeholder="placeholder"
      :autocomplete="autocomplete"
      :autofocus="autofocus"
      :min="min"
      :max="max"
      class="mt-1.5 h-9 w-full rounded-block border border-vein bg-deepslate px-2.5 text-[13px] text-chalk placeholder:text-ash-dim/70 transition-colors hover:border-vein-lit focus:border-torch focus:outline-none"
      :class="mono ? 'font-mono' : ''"
    />
    <p v-if="hint" class="mt-1.5 text-[11px] text-ash-dim">{{ hint }}</p>
  </div>
</template>
