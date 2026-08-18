import type { GameAdapter, GameContext } from './types'

/**
 * Minecraft, via l'image itzg.
 *
 * C'est le seul jeu du panneau à disposer de catalogues de contenu intégrés
 * (CurseForge et Modrinth). Cette exception est assumée : elle existe parce
 * que ces catalogues sont interrogeables sans clé et que l'installation de
 * modpacks est le cœur de l'usage. Les autres jeux passent par le Steam
 * Workshop, hors du panneau.
 */

const REPO = 'itzg/minecraft-server'

/** Variable itzg portant la version du chargeur, propre à chaque famille. */
const LOADER_VERSION_ENV: Record<string, string> = {
  fabric: 'FABRIC_LOADER_VERSION',
  quilt: 'QUILT_LOADER_VERSION',
  forge: 'FORGE_VERSION',
  neoforge: 'NEOFORGE_VERSION',
}

/**
 * Image adaptée à une version de Minecraft.
 *
 * Chaque image itzg embarque UN seul JDK : le tag choisit la version de Java.
 * `latest` fournit aujourd'hui Java 25, trop récent pour la plupart des
 * modloaders — un modpack NeoForge 1.21.1 s'y écrase sur une erreur de mixin
 * qui n'a rien d'évident. Le tag doit donc suivre la version du jeu.
 */
export function imageForMinecraft(mcVersion: string | null | undefined): string {
  const m = (mcVersion ?? '').trim().match(/^1\.(\d+)(?:\.(\d+))?/)
  if (!m) return `${REPO}:java21`

  const minor = Number(m[1])
  const patch = Number(m[2] ?? 0)

  if (minor <= 16) return `${REPO}:java8`
  if (minor < 20 || (minor === 20 && patch < 5)) return `${REPO}:java17`
  return `${REPO}:java21`
}

export const RCON_PORT = 25575

/**
 * Marge mémoire au-dessus du tas Java.
 *
 * `MEMORY` fixe le tas de la JVM, mais le process consomme davantage :
 * metaspace, threads, buffers directs, GC. Si la limite du conteneur valait
 * exactement le tas, le noyau tuerait le serveur alors que Java se croit dans
 * les clous.
 */
export function minecraftContainerMemoryMb(heapMb: number): number {
  return heapMb + Math.max(1024, Math.round(heapMb * 0.25))
}

/**
 * Tas en dessous duquel les flags d'Aikar nuisent au lieu d'aider.
 *
 * Ils agrandissent délibérément la jeune génération (`G1NewSizePercent=30`)
 * parce que Minecraft produit surtout des objets à durée de vie très courte.
 * Sur un petit tas, 30 % ne font plus une jeune génération « grande » mais une
 * vieille génération étriquée, et les collectes mixtes deviennent fréquentes :
 * l'exact contraire du but recherché.
 */
export const AIKAR_MIN_HEAP_MB = 4096

export const minecraft: GameAdapter = {
  id: 'minecraft',
  name: 'Minecraft',
  tagline: 'Vanilla, Paper, Forge, Fabric ou un modpack complet.',
  defaultPort: 25565,
  defaultMemoryGb: 4,
  versionSelectable: true,
  // Minecraft Java n'existe pas sur Steam : on garde la marque dessinée.
  steamName: null,
  contentSources: ['curseforge', 'modrinth'],
  configFile: { path: 'server.properties', format: 'properties' },

  image: (ctx) =>
    imageForMinecraft(
      // Un modpack impose sa version : elle n'est connue qu'après installation.
      ctx.row.type === 'MODPACK' && ctx.row.mc_version === 'LATEST'
        ? null
        : ctx.row.mc_version,
    ),

  ports: () => [
    { container: 25565, protocol: 'tcp', offset: 0 },
    // RCON reste sur la boucle locale : le publier ouvrirait une console
    // d'administration par serveur.
    { container: RCON_PORT, protocol: 'tcp', offset: 0, loopbackOnly: true },
  ],

  rcon: {
    port: RCON_PORT,
    listCommand: 'list',
    parsePlayers(res) {
      // « There are 4 of a max of 20 players online: … »
      const m = res.match(/(\d+)\s*(?:of a max(?:imum)? of|\/)\s*(\d+)/i)
      return m ? { online: Number(m[1]), max: Number(m[2]) } : null
    },
    broadcast: (message) => `say ${message}`,
    msptCommand: 'mspt',
    parseMspt(res) {
      /**
       * Paper répond sur trois lignes — 5 s, 10 s puis 1 min — chacune au
       * format « moyenne/min/max ». On garde la moyenne de la première : c'est
       * la fenêtre la plus courte, donc celle qui réagit pendant qu'on regarde.
       */
      const m = res.match(/(\d+(?:[.,]\d+)?)\/(\d+(?:[.,]\d+)?)\/(\d+(?:[.,]\d+)?)/)
      if (!m) return null
      const avg = Number(m[1]!.replace(',', '.'))
      return Number.isFinite(avg) && avg >= 0 ? avg : null
    },
  },

  /**
   * `save-off` suspend l'écriture du monde, `save-all flush` force ce qui
   * reste en mémoire sur le disque. Sans ces deux-là, une archive prise à
   * chaud contient un monde à moitié écrit.
   */
  backupFlush: {
    before: ['save-off', 'save-all flush'],
    after: ['save-on'],
  },

  buildEnv(ctx: GameContext) {
    const row = ctx.row
    const env: Record<string, string> = {
      EULA: 'TRUE',
      MEMORY: `${row.memory_mb}M`,
      ENABLE_RCON: 'true',
      RCON_PASSWORD: row.rcon_password,
      RCON_PORT: String(RCON_PORT),
      STOP_SERVER_ANNOUNCE_DELAY: '5',
      UID: '1000',
      GID: '1000',
    }

    /**
     * Flags GC d'Aikar. Ils ne rendent pas le serveur plus rapide : ils
     * rendent ses ticks plus réguliers, en échangeant des pauses rares et
     * longues contre des pauses fréquentes et courtes. C'est le bon compromis
     * pour une boucle à 20 ticks par seconde, où une pause de 300 ms se voit.
     */
    if (ctx.options.aikarFlags === 'true') env.USE_AIKAR_FLAGS = 'true'

    if (row.type === 'MODPACK' && row.modpack_source === 'CURSEFORGE') {
      /**
       * Les mods sont déjà posés dans /data par notre installeur : itzg n'a
       * plus qu'à installer le chargeur. On lui parle donc en type de
       * chargeur, pas en type de modpack.
       */
      if (!row.loader) throw new Error('Modloader du modpack inconnu.')
      env.TYPE = row.loader.toUpperCase()
      env.VERSION = row.mc_version
      const versionVar = LOADER_VERSION_ENV[row.loader.toLowerCase()]
      if (versionVar && row.loader_version) env[versionVar] = row.loader_version
    } else if (row.type === 'MODPACK') {
      if (!row.modpack_project) throw new Error('Aucun modpack sélectionné.')
      env.TYPE = 'MODRINTH'
      env.MODRINTH_MODPACK = row.modpack_project
      if (row.modpack_version) env.MODRINTH_VERSION = row.modpack_version
      if (row.modpack_loader) env.MODRINTH_LOADER = row.modpack_loader
      // La version de Minecraft vient du modpack : l'imposer entrerait en conflit.
    } else {
      env.TYPE = row.type
      env.VERSION = row.mc_version
    }

    return env
  },
}
