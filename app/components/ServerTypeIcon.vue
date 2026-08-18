<script setup lang="ts">
import type { ServerType } from '#shared/types'

/**
 * Marques dessinées plutôt que logos importés : les logos officiels sont des
 * marques déposées, et un jeu d'icônes cohérent se lit mieux qu'un assemblage
 * de styles hétéroclites. Chacune évoque ce que le type fait, en géométrie
 * simple accordée aux blocs du reste de l'interface.
 */
defineProps<{ type: ServerType }>()
</script>

<template>
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="1.5"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    <!-- Vanilla : le bloc nu, le jeu tel quel -->
    <template v-if="type === 'VANILLA'">
      <path d="M12 2.5 20.5 7v10L12 21.5 3.5 17V7z" />
      <path d="M3.5 7 12 11.5 20.5 7" />
      <path d="M12 11.5v10" />
    </template>

    <!-- Paper : la feuille, avec son coin replié -->
    <template v-else-if="type === 'PAPER'">
      <path d="M14 2.5H6.5v19h11V6z" />
      <path d="M14 2.5V6h3.5" />
      <path d="M9.5 12h5M9.5 16h5" />
    </template>

    <!-- Fabric : le tissage, des fils entrecroisés -->
    <template v-else-if="type === 'FABRIC'">
      <path d="M3.5 8.5h17M3.5 15.5h17" />
      <path d="M8.5 3.5v17M15.5 3.5v17" />
    </template>

    <!-- Forge : l'enclume, l'atelier du modding -->
    <template v-else-if="type === 'FORGE'">
      <path d="M3.5 7.5h11l3 3h3l-2.5 4.5h-11l-3.5-4z" />
      <path d="M9.5 15v3.5M6 21.5h9l-1.5-3h-6z" />
    </template>

    <!-- Modpack : des blocs empilés, un ensemble déjà composé -->
    <template v-else>
      <path d="M12 2.5 19.5 6 12 9.5 4.5 6z" />
      <path d="M4.5 12 12 15.5 19.5 12" />
      <path d="M4.5 18 12 21.5 19.5 18" />
    </template>
  </svg>
</template>
