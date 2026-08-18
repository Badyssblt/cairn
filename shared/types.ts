/**
 * Vocabulaire partagé entre l'interface et le serveur.
 * Une seule définition : le front et l'API ne peuvent pas diverger.
 */

export type ServerState =
  | 'running'
  | 'stopped'
  | 'starting'
  | 'stopping'
  /** Modpack en cours de téléchargement : le conteneur n'existe pas encore. */
  | 'installing'
  | 'error'

export type ServerType = 'VANILLA' | 'PAPER' | 'FORGE' | 'FABRIC' | 'MODPACK'

/**
 * Les descriptions s'adressent à quelqu'un qui veut monter un serveur, pas à
 * quelqu'un qui connaît l'écosystème : elles disent à quoi sert chaque type et
 * pour qui, sans vocabulaire d'initié.
 */
export const SERVER_TYPES: {
  value: ServerType
  label: string
  hint: string
  badge?: string
}[] = [
  {
    value: 'VANILLA',
    label: 'Vanilla',
    hint: 'Le jeu tel quel, sans rien ajouter.',
  },
  {
    value: 'PAPER',
    label: 'Paper',
    hint: 'Plus fluide à plusieurs, et accepte les plugins.',
    badge: 'Conseillé',
  },
  {
    value: 'MODPACK',
    label: 'Modpack',
    hint: 'Une aventure complète, déjà assemblée et prête à jouer.',
    badge: 'Populaire',
  },
  {
    value: 'FABRIC',
    label: 'Fabric',
    hint: 'Pour choisir soi-même des mods légers.',
  },
  {
    value: 'FORGE',
    label: 'Forge',
    hint: 'Pour choisir soi-même parmi les mods les plus nombreux.',
  },
]

/** Versions proposées d'emblée. Une saisie libre reste possible à côté. */
export const COMMON_MC_VERSIONS = [
  '1.21.4',
  '1.21.1',
  '1.20.6',
  '1.20.1',
  '1.19.2',
  '1.18.2',
  '1.16.5',
  '1.12.2',
]

/** Un échantillon = un bloc du tick ribbon. Intervalle ~30 s. */
export interface Sample {
  ts: number
  state: ServerState
  /**
   * Ticks par seconde. 20 = nominal.
   * null hors Paper/Spigot : vanilla n'expose pas la commande `tps`.
   */
  tps: number | null
  /**
   * Durée moyenne d'un tick, en millisecondes. Le budget est de 50 ms.
   *
   * C'est la mesure qui reste lisible quand le TPS ne l'est plus : tant que le
   * serveur tient la cadence, le TPS affiche 20,0 et ne dit rien de la marge
   * restante — 5 ms et 45 ms s'y ressemblent, alors que le second est au bord
   * du décrochage. null hors Paper.
   */
  mspt: number | null
  players: number | null
  maxPlayers: number | null
  ramUsedMb: number | null
  /** Pourcentage CPU du conteneur, 100 = un cœur saturé. */
  cpuPercent: number | null
}

/**
 * Santé d'un échantillon, telle que la lit le ribbon.
 *
 * Le TPS prime quand il existe. Sinon on se rabat sur le CPU : un serveur
 * Minecraft est mono-thread sur sa boucle de tick, donc un conteneur qui
 * sature durablement un cœur est un serveur qui n'arrive plus à suivre.
 */
export type Health = 'good' | 'degraded' | 'bad' | 'unknown'

export function sampleHealth(s: {
  tps: number | null
  cpuPercent: number | null
}): Health {
  if (s.tps !== null) {
    if (s.tps >= 19) return 'good'
    if (s.tps >= 15) return 'degraded'
    return 'bad'
  }
  if (s.cpuPercent !== null) {
    if (s.cpuPercent >= 180) return 'bad'
    if (s.cpuPercent >= 95) return 'degraded'
    return 'good'
  }
  return 'unknown'
}

export interface MinecraftServer {
  id: string
  name: string
  /** Identifiant du jeu : minecraft, valheim, palworld… */
  game: string
  type: ServerType
  mcVersion: string
  /** Nom lisible du modpack, uniquement pour type MODPACK. */
  modpackName?: string | null
  hostPort: number
  /** Tas Java alloué au serveur. */
  memoryMb: number
  /**
   * Limite mémoire du conteneur : le tas plus la marge hors-tas.
   * C'est le vrai plafond avant un arrêt par le noyau, et donc le
   * dénominateur qui a du sens — la JVM réservant tout son tas au démarrage,
   * une consommation rapportée au tas afficherait 100 % en permanence.
   */
  memoryLimitMb: number
  /** Flags GC d'Aikar actifs sur ce serveur. Minecraft uniquement. */
  aikarFlags?: boolean
  state: ServerState
  players: number | null
  maxPlayers: number | null
  tps: number | null
  /** Durée moyenne d'un tick, en ms. Budget 50 ms. null hors Paper. */
  mspt: number | null
  ramUsedMb: number | null
  cpuPercent: number | null
  /** Taille du dossier du serveur. Rafraîchie ponctuellement. */
  diskUsedMb: number | null
  /** Horodatage du démarrage du conteneur, pour calculer la durée en marche. */
  startedAt: number | null
  samples: Sample[]
  /** Source du modpack : MODRINTH ou CURSEFORGE. */
  modpackSource?: string | null
  /** Vignette du serveur, pour l'identifier d'un coup d'œil. */
  iconUrl?: string | null
  /** Plafond CPU en cœurs. null = pas de limite. */
  cpuLimit?: number | null
  /**
   * Seuil d'alerte sur la taille du dossier, en Mo.
   * Ce n'est pas une barrière : limiter un montage exige un pilote de
   * stockage particulier qu'on ne peut pas supposer.
   */
  diskLimitMb?: number | null
  /** Le serveur replante-t-il aussitôt relancé ? */
  crashLooping?: boolean
  /** Relances par Docker depuis la création du conteneur. */
  restartCount?: number
  /** Avancement de l'installation, uniquement pendant celle-ci. */
  install?: { step: string; progress: number } | null
  /** Message d'échec d'installation, à afficher tel quel. */
  installError?: string | null
}
