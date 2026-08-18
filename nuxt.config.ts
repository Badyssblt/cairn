import tailwindcss from '@tailwindcss/vite'

export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: true },

  modules: ['@nuxt/fonts'],

  css: ['~/assets/css/main.css'],

  vite: {
    plugins: [tailwindcss()],
  },

  // Les modules natifs restent côté Node : ils ne doivent jamais être bundlés.
  nitro: {
    experimental: { websocket: true },
    // Nitro n'auto-importe que server/utils : le registre des jeux vit à
    // part, pour que chaque adaptateur reste un fichier isolé et lisible.
    imports: { dirs: ['server/games'] },
    externals: {
      external: ['better-sqlite3', 'dockerode', '@node-rs/argon2'],
    },
  },

  // Self-hosting : un panneau d'admin ne doit pas appeler un CDN externe.
  fonts: {
    families: [
      // Archivo est déclarée à la main dans main.css : elle a besoin de l'axe
      // de largeur, que le provider Google ne récupère pas ici.
      { name: 'Archivo', provider: 'none' },
      { name: 'IBM Plex Sans', provider: 'google', weights: [400, 500, 600] },
      { name: 'IBM Plex Mono', provider: 'google', weights: [400, 500] },
    ],
  },

  runtimeConfig: {
    sessionSecret: '',
    dataRoot: '/srv/minecraft',
    dbPath: './data/minemanager.db',
    dockerSocket: '/var/run/docker.sock',
  },

  app: {
    head: {
      htmlAttrs: { lang: 'fr' },
      meta: [
        { name: 'viewport', content: 'width=device-width, initial-scale=1' },
        { name: 'color-scheme', content: 'dark' },
        { name: 'theme-color', content: '#14161C' },
      ],
    },
  },
})
