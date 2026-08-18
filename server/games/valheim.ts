import type { GameAdapter } from './types'

/**
 * Valheim.
 *
 * Trois ports UDP consécutifs sont nécessaires : le jeu utilise le premier
 * pour la partie et les suivants pour la découverte Steam. Ce n'est pas un
 * confort, un serveur amputé de ses ports voisins n'apparaît pas dans la liste.
 *
 * Le mot de passe est obligatoire côté serveur et doit différer du nom : le
 * jeu refuse de démarrer sinon, ce qui vaut mieux d'annoncer à la saisie que
 * de laisser découvrir dans les journaux.
 */
export const valheim: GameAdapter = {
  id: 'valheim',
  name: 'Valheim',
  tagline: 'Survie viking en coopération, jusqu’à dix joueurs.',
  defaultPort: 2456,
  defaultMemoryGb: 4,
  configFile: { path: 'config/worlds_local', format: 'text' },

  image: () => 'lloesche/valheim-server:latest',

  ports: () => [
    { container: 2456, protocol: 'udp', offset: 0 },
    { container: 2457, protocol: 'udp', offset: 1 },
    { container: 2458, protocol: 'udp', offset: 2 },
  ],

  fields: [
    {
      key: 'serverName',
      label: 'Nom affiché dans la liste des serveurs',
      type: 'text',
      required: true,
      default: 'Mon serveur Valheim',
    },
    {
      key: 'worldName',
      label: 'Nom du monde',
      hint: 'Un monde existant portant ce nom sera repris.',
      type: 'text',
      required: true,
      default: 'Dedicated',
    },
    {
      key: 'password',
      label: 'Mot de passe',
      hint: 'Cinq caractères au minimum, et différent du nom du serveur.',
      type: 'password',
      required: true,
    },
  ],

  buildEnv: (ctx) => ({
    SERVER_NAME: ctx.options.serverName || ctx.row.name,
    WORLD_NAME: ctx.options.worldName || 'Dedicated',
    SERVER_PASS: ctx.options.password || '',
    SERVER_PORT: String(ctx.row.host_port),
    SERVER_PUBLIC: 'true',
    // L'image sait se mettre à jour seule ; on garde la main sur le redémarrage.
    UPDATE_CRON: '',
    RESTART_CRON: '',
    TZ: 'Europe/Paris',
  }),
}
