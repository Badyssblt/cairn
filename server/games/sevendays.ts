import type { GameAdapter } from './types'

/**
 * 7 Days to Die.
 *
 * Le jeu réserve trois ports UDP consécutifs et un port web facultatif. Il
 * demande beaucoup de mémoire : la carte est générée puis tenue en RAM.
 */
export const sevenDaysToDie: GameAdapter = {
  id: '7dtd',
  name: '7 Days to Die',
  tagline: 'Survie et zombies, avec une carte à défendre.',
  defaultPort: 26900,
  defaultMemoryGb: 6,

  image: () => 'didstopia/7dtd-server:latest',

  ports: () => [
    { container: 26900, protocol: 'tcp', offset: 0 },
    { container: 26900, protocol: 'udp', offset: 0 },
    { container: 26901, protocol: 'udp', offset: 1 },
    { container: 26902, protocol: 'udp', offset: 2 },
  ],

  configFile: { path: 'serverconfig.xml', format: 'text' },

  fields: [
    { key: 'serverName', label: 'Nom du serveur', type: 'text', required: true },
    { key: 'password', label: 'Mot de passe', type: 'password' },
    {
      key: 'maxPlayers',
      label: 'Joueurs maximum',
      type: 'number',
      default: '8',
    },
  ],

  buildEnv: (ctx) => ({
    SEVEN_DAYS_TO_DIE_SERVER_NAME: ctx.options.serverName || ctx.row.name,
    SEVEN_DAYS_TO_DIE_SERVER_PASSWORD: ctx.options.password || '',
    SEVEN_DAYS_TO_DIE_SERVER_MAX_PLAYERS: ctx.options.maxPlayers || '8',
    SEVEN_DAYS_TO_DIE_SERVER_PORT: String(ctx.row.host_port),
    SEVEN_DAYS_TO_DIE_TELNET_ENABLED: 'true',
    SEVEN_DAYS_TO_DIE_TELNET_PASSWORD: ctx.row.rcon_password,
    START_MODE: '1',
  }),
}
