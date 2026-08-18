import type { GameAdapter } from './types'

/**
 * Palworld.
 *
 * Gourmand en mémoire : 8 Go est un plancher réaliste à quatre joueurs, et le
 * serveur se fait tuer par le noyau en dessous. Le proposer plus bas rendrait
 * service à personne.
 */
export const palworld: GameAdapter = {
  id: 'palworld',
  name: 'Palworld',
  tagline: 'Survie et créatures à capturer, en coopération.',
  defaultPort: 8211,
  defaultMemoryGb: 8,

  image: () => 'thijsvanloef/palworld-server-docker:latest',

  ports: (ctx) => [
    { container: 8211, protocol: 'udp', offset: 0 },
    { container: 25575, protocol: 'tcp', offset: 0, loopbackOnly: true },
  ],

  rcon: {
    port: 25575,
    listCommand: 'ShowPlayers',
    parsePlayers(res) {
      // « name,playeruid,steamid » — une ligne d'en-tête puis un joueur par ligne.
      const lines = res.trim().split('\n').filter((l) => l.trim())
      return { online: Math.max(0, lines.length - 1), max: 32 }
    },
  },

  fields: [
    { key: 'serverName', label: 'Nom du serveur', type: 'text', required: true },
    {
      key: 'password',
      label: 'Mot de passe',
      hint: 'Laisse vide pour un serveur ouvert à tous.',
      type: 'password',
    },
    {
      key: 'adminPassword',
      label: 'Mot de passe administrateur',
      hint: 'Requis pour les commandes en jeu.',
      type: 'password',
      required: true,
    },
    { key: 'maxPlayers', label: 'Joueurs maximum', type: 'number', default: '16' },
  ],

  buildEnv: (ctx) => ({
    PORT: String(ctx.row.host_port),
    PLAYERS: ctx.options.maxPlayers || '16',
    SERVER_NAME: ctx.options.serverName || ctx.row.name,
    SERVER_PASSWORD: ctx.options.password || '',
    ADMIN_PASSWORD: ctx.options.adminPassword || ctx.row.rcon_password,
    RCON_ENABLED: 'true',
    RCON_PORT: '25575',
    // L'image lit ce mot de passe pour RCON : c'est celui de l'admin.
    COMMUNITY: 'false',
    UPDATE_ON_BOOT: 'true',
    TZ: 'Europe/Paris',
  }),
}
