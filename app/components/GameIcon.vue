<script setup lang="ts">
/**
 * Marques de jeu, dessinées dans le même trait que le reste du panneau.
 *
 * Pas de logos officiels : ce sont des marques déposées, et un jeu d'icônes
 * cohérent se lit mieux qu'un assemblage de styles. Chacune évoque le jeu par
 * sa forme la plus reconnaissable.
 */
defineProps<{ game: string }>()
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
    <!-- Minecraft : le bloc isométrique -->
    <template v-if="game === 'minecraft'">
      <path d="M12 2.5 20.5 7v10L12 21.5 3.5 17V7z" />
      <path d="M3.5 7 12 11.5 20.5 7M12 11.5v10" />
    </template>

    <!-- Valheim : la proue d'un drakkar -->
    <template v-else-if="game === 'valheim'">
      <path d="M3 15.5h18l-2.5 5H5.5z" />
      <path d="M12 14.5V3.5M12 3.5c3 1.5 5 3.5 5.5 6.5H12" />
    </template>

    <!-- Palworld : la sphère de capture -->
    <template v-else-if="game === 'palworld'">
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h6M15 12h6" />
      <circle cx="12" cy="12" r="3" />
    </template>

    <!-- Factorio : l'engrenage -->
    <template v-else-if="game === 'factorio'">
      <circle cx="12" cy="12" r="3.5" />
      <path
        d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.2 5.2l2.1 2.1M16.7 16.7l2.1 2.1M18.8 5.2l-2.1 2.1M7.3 16.7l-2.1 2.1"
      />
    </template>

    <!-- 7 Days to Die : le compte à rebours -->
    <template v-else-if="game === '7dtd'">
      <circle cx="12" cy="13" r="8.5" />
      <path d="M12 8.5V13l3 2M9 2.5h6" />
    </template>

    <!-- Repli : un bloc générique -->
    <template v-else>
      <rect x="3.5" y="6.5" width="17" height="11" rx="2.5" />
      <path d="M8 12h3M9.5 10.5v3M15.5 11h.01M17.5 13.5h.01" />
    </template>
  </svg>
</template>
