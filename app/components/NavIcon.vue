<script setup lang="ts">
/**
 * Jeu d'icônes de navigation, dessiné d'un seul trait pour rester cohérent
 * avec les marques de type de serveur.
 */
defineProps<{
  name:
    | 'servers'
    | 'settings'
    | 'console'
    | 'files'
    | 'players'
    | 'config'
    | 'danger'
    | 'logout'
    | 'copy'
    | 'plus'
}>()
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
    <!-- Le rack : des unités empilées -->
    <template v-if="name === 'servers'">
      <rect x="3" y="4" width="18" height="6" rx="1.5" />
      <rect x="3" y="14" width="18" height="6" rx="1.5" />
      <path d="M6.5 7h.01M6.5 17h.01" />
    </template>

    <template v-else-if="name === 'settings'">
      <circle cx="12" cy="12" r="3" />
      <path
        d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-2.9 1.2v.2a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-3-1.2l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0-1.2-2.9h-.2a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.2-3l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 2.9-1.2v-.2a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 3 1.2l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0 1.2 2.9h.2a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.6 1z"
      />
    </template>

    <!-- Console : une invite de commande -->
    <template v-else-if="name === 'console'">
      <rect x="2.5" y="4" width="19" height="16" rx="2" />
      <path d="M7 9.5 9.5 12 7 14.5M12.5 15h4.5" />
    </template>

    <template v-else-if="name === 'files'">
      <path d="M3 7.5a2 2 0 0 1 2-2h3.5l2 2.5H19a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
    </template>

    <template v-else-if="name === 'players'">
      <circle cx="9" cy="8" r="3.2" />
      <path d="M2.8 19.5c0-3.2 2.8-5.3 6.2-5.3s6.2 2.1 6.2 5.3" />
      <path d="M16.5 5.4a3.2 3.2 0 0 1 0 5.8M18.5 14.6c1.7.7 2.8 2.1 2.8 4" />
    </template>

    <template v-else-if="name === 'config'">
      <path d="M6 3.5h9L18.5 7v13.5h-13z" />
      <path d="M8.5 11h7M8.5 15h4.5M8.5 7h3" />
    </template>

    <template v-else-if="name === 'danger'">
      <path d="M12 3.5 21.5 20h-19z" />
      <path d="M12 10v4.5M12 17.5h.01" />
    </template>

    <template v-else-if="name === 'logout'">
      <path d="M14.5 20H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h8.5" />
      <path d="m17 15.5 3.5-3.5L17 8.5M20.5 12H9.5" />
    </template>

    <template v-else-if="name === 'copy'">
      <rect x="9" y="9" width="12" height="12" rx="2" />
      <path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1" />
    </template>

    <template v-else>
      <path d="M12 5.5v13M5.5 12h13" />
    </template>
  </svg>
</template>
