import type { GameAdapter } from './types'

/**
 * Factorio.
 *
 * Très léger : 2 Go suffisent largement, même sur une grande usine. Le serveur
 * est en UDP et expose RCON, ce qui donne une console interactive complète.
 */
export const factorio: GameAdapter = {
  id: 'factorio',
  name: 'Factorio',
  tagline: 'Construction d’usines à plusieurs. Très peu gourmand.',
  defaultPort: 34197,
  defaultMemoryGb: 2,

  image: () => 'factoriotools/factorio:stable',

  ports: () => [
    { container: 34197, protocol: 'udp', offset: 0 },
    { container: 27015, protocol: 'tcp', offset: 0, loopbackOnly: true },
  ],

  rcon: {
    port: 27015,
    listCommand: '/players online',
    parsePlayers(res) {
      // « Online players (2): » puis un joueur par ligne.
      const m = res.match(/\((\d+)\)/)
      return m ? { online: Number(m[1]), max: 0 } : null
    },
  },

  configFile: { path: 'config/server-settings.json', format: 'json' },

  fields: [
    { key: 'serverName', label: 'Nom du serveur', type: 'text', required: true },
    {
      key: 'password',
      label: 'Mot de passe',
      hint: 'Laisse vide pour un serveur ouvert.',
      type: 'password',
    },
  ],

  buildEnv: (ctx) => ({
    PORT: String(ctx.row.host_port),
    RCON_PORT: '27015',
    RCON_PASSWORD: ctx.row.rcon_password,
    SAVE_NAME: 'partie',
    // L'image génère le monde au premier démarrage si le fichier manque.
    GENERATE_NEW_SAVE: 'true',
    UPDATE_MODS_ON_START: 'false',
  }),
}
