<script setup lang="ts">
/**
 * Bouton — un bloc, pas une pilule.
 * La profondeur vient du palier de surface et du filet, jamais d'une ombre.
 * Rend un lien dès qu'une destination est fournie, pour garder la sémantique.
 */
const props = withDefaults(
  defineProps<{
    variant?: 'primary' | 'default' | 'ghost' | 'danger'
    size?: 'sm' | 'md'
    icon?: boolean
    disabled?: boolean
    type?: 'button' | 'submit'
    to?: string
    /** Lien hors du routeur : téléchargement servi par l'API. */
    external?: boolean
  }>(),
  { variant: 'default', size: 'md', type: 'button' },
)

const variants = {
  primary:
    'bg-torch text-deepslate border-torch hover:bg-torch-lit hover:border-torch-lit font-semibold',
  default: 'bg-stone text-chalk border-vein hover:bg-stone-lit hover:border-vein-lit',
  ghost: 'bg-transparent text-ash border-transparent hover:bg-stone hover:text-chalk',
  danger:
    'bg-transparent text-redstone border-redstone-dim hover:bg-redstone-dim hover:text-chalk',
}

const sizes = { sm: 'h-7 px-2.5 text-xs', md: 'h-9 px-3.5 text-sm' }
const iconSizes = { sm: 'h-7 w-7', md: 'h-9 w-9' }

const classes = computed(() => [
  'inline-flex items-center justify-center gap-1.5 rounded-block border transition-colors duration-100 disabled:pointer-events-none disabled:opacity-40',
  variants[props.variant],
  props.icon ? iconSizes[props.size] : sizes[props.size],
])
</script>

<template>
  <a v-if="to && external" :href="to" :class="classes" download>
    <slot />
  </a>
  <NuxtLink v-else-if="to" :to="to" :class="classes">
    <slot />
  </NuxtLink>
  <button v-else :type="type" :disabled="disabled" :class="classes">
    <slot />
  </button>
</template>
