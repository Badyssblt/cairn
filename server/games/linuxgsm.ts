import type { GameAdapter, PortSpec } from './types'

/**
 * LINUXGSM — adaptateur générique
 *
 * Un seul adaptateur pour environ 140 jeux : le tag de l'image porte le nom
 * court LinuxGSM (`gameservermanagers/gameserver:rust`), et l'entrypoint fait
 * le reste. C'est le meilleur rapport couverture/effort du panneau.
 *
 * Ses limites sont assumées, et dites à l'utilisateur plutôt que découvertes :
 *
 * - **Les ports sont demandés.** Chaque jeu a sa propre carte de ports, et
 *   inventer une table de 140 entrées produirait surtout des erreurs. Mieux
 *   vaut demander que deviner faux.
 * - **Pas de console interactive.** Le dialecte de commande varie d'un jeu à
 *   l'autre ; on affiche le journal, sans prétendre pouvoir tout piloter.
 *
 * Un jeu qui mérite mieux gagne son propre adaptateur, comme Minecraft.
 */

/** « 27015/udp, 27015/tcp, 27020/udp » → liste de ports. */
export function parsePorts(raw: string, basePort: number): PortSpec[] {
  const specs: PortSpec[] = []

  for (const chunk of raw.split(/[,\s]+/).filter(Boolean)) {
    const m = chunk.match(/^(\d{1,5})(?:\/(tcp|udp))?$/i)
    if (!m) continue
    const port = Number(m[1])
    if (port < 1 || port > 65535) continue

    specs.push({
      container: port,
      protocol: (m[2]?.toLowerCase() as 'tcp' | 'udp') ?? 'tcp',
      // Le décalage rend la plage relative au port principal : la détection
      // de collision et la publication réutilisent alors la même mécanique
      // que les autres jeux, sans cas particulier.
      offset: port - basePort,
    })
  }
  return specs
}

/** Nom du service LinuxGSM, d'où découlent ses chemins de configuration. */
export function lgsmService(ctx: { options: Record<string, string> }): string {
  return (
    (ctx.options.gameservername || '').trim() ||
    `${(ctx.options.shortname || '').trim()}server`
  )
}

export const linuxgsm: GameAdapter = {
  id: 'linuxgsm',
  name: 'Autre jeu',
  tagline: 'Environ 140 jeux via LinuxGSM : Rust, ARK, DayZ, Arma, Garry’s Mod…',
  defaultPort: 27015,
  defaultMemoryGb: 4,
  // « Autre jeu » n'est pas un titre : le visuel arrive avec le jeu choisi.
  steamName: null,

  image: (ctx) => {
    const shortname = (ctx.options.shortname || '').trim().toLowerCase()
    if (!/^[a-z0-9]+$/.test(shortname)) {
      throw new Error("Nom court LinuxGSM invalide.")
    }
    return `gameservermanagers/gameserver:${shortname}`
  },

  ports: (ctx) => {
    const parsed = parsePorts(ctx.options.ports || '', ctx.row.host_port)
    // Sans indication, on publie au moins le port principal : un serveur
    // injoignable serait pire qu'un serveur aux ports incomplets.
    return parsed.length
      ? parsed
      : [{ container: ctx.row.host_port, protocol: 'udp', offset: 0 }]
  },

  /**
   * LinuxGSM range la configuration de chaque serveur sous un chemin qui
   * dépend de son nom de service : `config-lgsm/gmodserver/gmodserver.cfg`.
   * C'est ce fichier que l'on édite, pas un `server.properties` qui n'existe
   * que chez Minecraft.
   */
  configFile: (ctx) => {
    const svc = lgsmService(ctx)
    return { path: `config-lgsm/${svc}/${svc}.cfg`, format: 'lgsm' as const }
  },

  fields: [
    {
      key: 'shortname',
      label: 'Nom court LinuxGSM',
      hint: 'Par exemple rust, ark, gmod, dayz, pz. La liste complète est proposée ci-dessous.',
      type: 'text',
      required: true,
    },
    {
      key: 'ports',
      label: 'Ports du jeu',
      hint: 'Séparés par des virgules, avec leur protocole : 27015/udp, 27015/tcp.',
      type: 'text',
      required: true,
      default: '27015/udp, 27015/tcp',
    },
  ],

  buildEnv: () => ({
    UID: '1000',
    GID: '1000',
    TZ: 'Europe/Paris',
  }),
}
