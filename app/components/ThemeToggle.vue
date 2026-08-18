<script setup lang="ts">
/** Bascule à trois états, montée sur `useTheme` : le choix reste local à ce contrôle. */
const { choice, setTheme, sync } = useTheme()

onMounted(sync)

const options = [
  { value: 'system' as const, icon: 'system' as const, label: 'Système' },
  { value: 'light' as const, icon: 'sun' as const, label: 'Clair' },
  { value: 'dark' as const, icon: 'moon' as const, label: 'Sombre' },
]
</script>

<template>
  <div
    role="radiogroup"
    aria-label="Thème"
    class="inline-flex rounded-block border border-vein bg-deepslate p-0.5"
  >
    <button
      v-for="opt in options"
      :key="opt.value"
      type="button"
      role="radio"
      :aria-checked="choice === opt.value"
      :title="opt.label"
      class="grid h-6 w-6 place-items-center rounded-[3px] transition-colors"
      :class="choice === opt.value ? 'bg-stone-lit text-torch' : 'text-ash-dim hover:text-ash'"
      @click="setTheme(opt.value)"
    >
      <NavIcon :name="opt.icon" class="h-3.5 w-3.5" />
    </button>
  </div>
</template>
