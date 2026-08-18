import type { ServerRow } from '../utils/servers'

/**
 * ADAPTATEUR DE JEU
 *
 * Tout ce qui distingue un jeu d'un autre tient ici : son image, ses variables
 * d'environnement, ses ports, son dialecte de console, son fichier de config.
 * Le reste du panneau — rack, jauges, fichiers, sauvegardes — ne connaît que
 * cette interface et n'a rien de spécifique à un jeu.
 *
 * Minecraft est le seul à déclarer des sources de contenu (CurseForge,
 * Modrinth) : les autres jeux passent par le Steam Workshop ou n'ont pas
 * d'équivalent, et on ne cherche pas à leur inventer un catalogue.
 */

export interface PortSpec {
  /** Port à l'intérieur du conteneur. */
  container: number
  protocol: 'tcp' | 'udp'
  /**
   * Décalage par rapport au port principal choisi par l'utilisateur.
   * Valheim publie 2456-2458 : le port choisi vaut 0, les suivants 1 et 2.
   */
  offset: number
  /**
   * Publié sur la boucle locale uniquement. Réservé aux ports
   * d'administration : les exposer au réseau ouvrirait une console distante.
   */
  loopbackOnly?: boolean
}

/** Un réglage demandé à la création, propre au jeu. */
export interface GameField {
  key: string
  label: string
  hint?: string
  type: 'text' | 'password' | 'number' | 'select'
  required?: boolean
  default?: string
  options?: { value: string; label: string }[]
}

export interface GameContext {
  row: ServerRow
  /** Réglages saisis à la création, déjà décodés. */
  options: Record<string, string>
}

export interface GameAdapter {
  id: string
  /** Nom affiché. */
  name: string
  /** Une phrase qui dit à qui ça s'adresse, sans jargon. */
  tagline: string

  /** Image Docker. Dépend parfois de la version du jeu (cas de Minecraft). */
  image(ctx: GameContext): string

  /** Port par défaut proposé à la création. */
  defaultPort: number
  /** Mémoire conseillée, en Go. */
  defaultMemoryGb: number

  /** Ports à publier, le principal compris. */
  ports(ctx: GameContext): PortSpec[]

  /** Variables passées au conteneur. */
  buildEnv(ctx: GameContext): Record<string, string>

  /**
   * Console interactive par RCON. Absent = console en lecture seule : on
   * affiche le journal mais on ne peut pas envoyer de commande.
   */
  rcon?: {
    /** Port RCON dans le conteneur. */
    port: number
    /** Commande qui liste les joueurs, et comment lire sa réponse. */
    listCommand?: string
    parsePlayers?: (response: string) => { online: number; max: number } | null
    /**
     * Commande qui affiche un message à tous les joueurs connectés.
     *
     * Absent = le jeu n'a pas de canal d'annonce, et un redémarrage planifié
     * tombera sans prévenir. On préfère le dire à l'utilisateur au moment où
     * il configure la tâche plutôt que d'envoyer une commande au hasard.
     */
    broadcast?: (message: string) => string
    /**
     * Durée d'un tick, en millisecondes. Le TPS sature à 20 et cesse de bouger
     * dès que le serveur a de la marge : le MSPT est la seule mesure qui montre
     * combien il en reste. Minecraft seul en expose une, et seulement sur Paper.
     */
    msptCommand?: string
    parseMspt?: (response: string) => number | null
  }

  /**
   * Fichier de configuration principal, éditable dans l'interface.
   * Peut dépendre des réglages : LinuxGSM range le sien sous un chemin qui
   * varie avec le jeu choisi.
   */
  configFile?:
    | { path: string; format: 'properties' | 'lgsm' | 'json' | 'text' }
    | ((ctx: GameContext) => { path: string; format: 'properties' | 'lgsm' | 'json' | 'text' })

  /**
   * Commandes qui suspendent puis reprennent les écritures du monde, le temps
   * de prendre une archive cohérente. Absent = le jeu ne sait pas le faire,
   * et l'utilisateur en est averti au lieu de recevoir une fausse garantie.
   */
  backupFlush?: { before: string[]; after: string[] }

  /** Réglages demandés à la création. */
  fields?: GameField[]

  /**
   * Catalogues de contenu installables. Minecraft seul en déclare : c'est
   * l'exception assumée, pas un modèle à généraliser.
   */
  contentSources?: ('curseforge' | 'modrinth')[]

  /** Le jeu accepte-t-il qu'on choisisse sa version ? */
  versionSelectable?: boolean

  /**
   * Nom à chercher chez Steam pour récupérer la jaquette.
   *
   * `null` désactive la recherche : Minecraft Java n'est pas sur Steam, et
   * une recherche par nom y trouverait un homonyme — une image fausse est
   * pire qu'une marque dessinée.
   */
  steamName?: string | null
}
