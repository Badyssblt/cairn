import type { ServerRow } from './servers'
import type { CrashReport } from './crashReport'

/**
 * DIAGNOSTIC DES PANNES AU DÉMARRAGE
 *
 * Un serveur qui ne démarre pas laisse toujours la raison dans son journal —
 * mais noyée sous des centaines de lignes de pile Java. Repérer « Mod X
 * requires Y » au milieu d'une LoadingFailedException demande de savoir où
 * regarder ; c'est exactement le travail qu'un panneau doit faire à la place
 * de son utilisateur.
 *
 * Les motifs ci-dessous viennent de pannes réellement rencontrées, pas d'une
 * liste théorique. Chacun dit ce qui s'est passé, et surtout quoi faire.
 */

export interface Diagnosis {
  /** Ce qui ne va pas, en une phrase. */
  title: string
  /** Le détail, avec les noms concrets extraits du journal. */
  detail: string
  /** L'action qui répare, quand elle existe. */
  fix?: string
  /** Section du panneau où agir. */
  section?: 'files' | 'config' | 'version' | 'backups' | 'console' | 'maintenance'
  severity: 'error' | 'warning'
  /** La ligne du journal qui a servi de preuve. */
  evidence?: string
  /**
   * Réparation applicable depuis le panneau, quand on sait laquelle.
   *
   * Nommer le mod fautif sans offrir le geste laisserait le travail à moitié
   * fait : il faudrait aller le chercher dans l'onglet Contenu et deviner quel
   * fichier correspond à l'identifiant affiché.
   */
  action?: {
    kind: 'disableMod'
    /** Le jar exact à renommer. */
    filename: string
    label: string
  }
}

interface Pattern {
  /** Motif cherché dans le journal, du plus précis au plus général. */
  test: RegExp
  build: (m: RegExpMatchArray, ctx: { row: ServerRow }) => Diagnosis
}

const PATTERNS: Pattern[] = [
  /* -- Dépendance de mod absente ---------------------------------------- */
  {
    // Forge écrit une ligne structurée, bien plus fiable à lire que le
    // message coloré destiné aux humains.
    test: /Mod ID: '([^']+)', Requested by: '([^']+)', Expected range: '([^']+)', Actual version: '\[MISSING\]'/,
    build: (m) => ({
      title: 'Un mod réclame une dépendance absente',
      detail:
        `Le mod « ${m[2]} » a besoin de « ${m[1]} » en version ${m[3]}, ` +
        `qui n'est pas installé. Le pack a été livré incomplet par son auteur.`,
      fix:
        `Deux sorties : installer « ${m[1]} » dans le dossier mods, ` +
        `ou retirer « ${m[2]} » si tu peux t'en passer.`,
      section: 'files',
      severity: 'error',
      evidence: m[0],
    }),
  },
  {
    test: /requires (?:version )?(.+?) of ([\w -]+), which is missing/i,
    build: (m) => ({
      title: 'Un mod réclame une dépendance absente',
      detail: `Un mod a besoin de « ${m[2]} » (${m[1]}), qui n'est pas installé.`,
      fix: `Ajoute « ${m[2]} » dans le dossier mods, ou retire le mod qui le réclame.`,
      section: 'files',
      severity: 'error',
      evidence: m[0],
    }),
  },

  /* -- Version de Java inadaptée ---------------------------------------- */
  {
    // itzg/mc-server-runner refuse de lancer le jeu et le dit en clair, avant
    // même que Java n'entre en jeu : le message le plus explicite qui soit,
    // et pourtant le plus facile à rater au milieu du reste du journal.
    test: /Minecraft ([\d.]+) and newer requires running the server with Java (\d+) or above/,
    build: (m) => ({
      title: 'Java trop ancien pour cette version de Minecraft',
      detail: `Minecraft ${m[1]} exige Java ${m[2]} ou plus récent ; l'image du conteneur en fournit une plus ancienne.`,
      fix:
        "Le serveur doit être reconstruit avec la bonne image : ouvre Entretien, " +
        "retouche la mémoire allouée (par exemple +1 puis -1) et enregistre — " +
        "Cairn recrée le conteneur et choisit alors le Java qui convient.",
      section: 'maintenance',
      severity: 'error',
      evidence: m[0],
    }),
  },
  {
    test: /has been compiled by a more recent version of the Java Runtime.*?class file version (\d+\.\d+)/s,
    build: () => ({
      title: 'Java trop ancien pour ce serveur',
      detail: "Les fichiers du jeu ont été compilés pour une version de Java plus récente que celle du conteneur.",
      fix: 'Recrée le serveur avec une version de Minecraft cohérente : Cairn choisit alors le bon Java.',
      section: 'version',
      severity: 'error',
    }),
  },
  {
    // Symptôme déroutant : une classe du JDK déclarée introuvable pendant la
    // transformation d'un mixin trahit un Java trop récent, pas un mod cassé.
    test: /MixinPreProcessorException|ClassNotFoundException: java\.lang\.String/,
    build: () => ({
      title: 'Java trop récent pour ce modloader',
      detail:
        "Le chargement des mods échoue sur une erreur de mixin qui signale une " +
        "incompatibilité entre la version de Java et le modloader — et non un mod défectueux.",
      fix: "Vérifie la version de Minecraft du serveur : elle détermine l'image Java utilisée.",
      section: 'version',
      severity: 'error',
    }),
  },

  /* -- Réseau ------------------------------------------------------------ */
  {
    test: /(?:Address already in use|FAILED TO BIND TO PORT|Perhaps a server is already running)/i,
    build: (_m, { row }) => ({
      title: 'Le port est déjà occupé',
      detail: `Un autre programme utilise déjà le port ${row.host_port} sur la machine.`,
      fix: "Change le port du serveur, ou arrête ce qui l'occupe.",
      severity: 'error',
    }),
  },

  /* -- Espace et mémoire ------------------------------------------------- */
  {
    test: /No space left on device/i,
    build: () => ({
      title: 'Plus d’espace disque',
      detail: "L'écriture a échoué faute de place sur la machine.",
      fix: 'Supprime de vieilles sauvegardes, ou fais le ménage dans les journaux.',
      section: 'backups',
      severity: 'error',
    }),
  },
  {
    test: /java\.lang\.OutOfMemoryError/,
    build: () => ({
      title: 'Mémoire insuffisante pour Java',
      detail: "La machine virtuelle Java a épuisé la mémoire qui lui était allouée.",
      fix: 'Augmente la mémoire du serveur, ou allège le modpack.',
      severity: 'error',
    }),
  },

  /* -- Contrat et monde -------------------------------------------------- */
  {
    test: /You need to agree to the EULA/i,
    build: () => ({
      title: 'Contrat de licence non accepté',
      detail: "Le serveur attend l'acceptation du contrat de Mojang.",
      fix: "Cairn l'accepte normalement tout seul : signale-le, c'est anormal.",
      section: 'files',
      severity: 'error',
    }),
  },
  {
    test: /(?:Failed to load level|Exception initializing level|level\.dat.*?(?:corrupt|missing))/i,
    build: () => ({
      title: 'Le monde ne se charge pas',
      detail: 'Les fichiers du monde sont illisibles ou incomplets.',
      fix: 'Restaure une sauvegarde antérieure.',
      section: 'backups',
      severity: 'error',
    }),
  },

  /* -- Modloader --------------------------------------------------------- */
  {
    test: /Incompatible mod set|The following mods are not compatible/i,
    build: () => ({
      title: 'Mods incompatibles entre eux',
      detail: 'Plusieurs mods réclament des versions inconciliables.',
      fix: "Retire le mod ajouté en dernier, ou reviens à la version précédente du pack.",
      section: 'version',
      severity: 'error',
    }),
  },
  {
    test: /Missing or unsupported mandatory dependencies|LoadingFailedException/,
    build: () => ({
      // Filet : on a repéré un échec de chargement sans en identifier la cause.
      title: 'Le chargement des mods a échoué',
      detail: "Un mod empêche le démarrage, sans que la cause précise ait pu être identifiée.",
      fix: 'Ouvre la console : la ligne « Failure message » donne le détail.',
      section: 'console',
      severity: 'error',
    }),
  },

  /* -- LinuxGSM et Steam -------------------------------------------------- */
  {
    test: /(?:Steam Guard|Invalid Password|FAILED login)/i,
    build: () => ({
      title: 'Connexion à Steam refusée',
      detail: "SteamCMD n'a pas pu s'authentifier pour télécharger le serveur.",
      fix: 'Vérifie les identifiants Steam dans les réglages du serveur.',
      section: 'config',
      severity: 'error',
    }),
  },
]

/**
 * Motifs cherchés sur un serveur qui tourne.
 *
 * Ceux du dessus expliquent pourquoi le serveur ne démarre pas ; ceux-ci
 * signalent qu'il va mal alors qu'il est debout. Les deux listes sont séparées
 * parce qu'elles ne se cherchent pas dans les mêmes circonstances : lire une
 * pile de chargement sur un serveur en marche n'aurait pas de sens, et
 * inversement un décrochage de ticks ne se constate que quand il tourne.
 */
const RUNNING_PATTERNS: Pattern[] = [
  {
    /**
     * « Can't keep up! » est le seul aveu explicite du serveur : il dit qu'un
     * tick a dépassé son budget de 50 ms, et de combien. Le TPS, lui, affiche
     * encore 20,0 juste avant — il ne bouge qu'une fois le décrochage installé,
     * ce qui en fait un mauvais témoin de l'instant où le problème commence.
     */
    test: /Can't keep up!.*?Running (\d+)\s*ms.*?behind.*?skipping (\d+) tick/i,
    build: (m) => ({
      title: 'Le serveur ne tient plus la cadence',
      detail:
        `Un tick a débordé de ${m[1]} ms, et ${m[2]} ticks ont été sautés pour ` +
        `rattraper. Les joueurs le voient comme un ralenti, pas comme une panne : ` +
        `les mobs saccadent et les blocs cassés reviennent.`,
      fix:
        `Baisse view-distance puis simulation-distance dans la configuration : ` +
        `ce sont les deux réglages qui pèsent le plus lourd. Si le retard revient ` +
        `sans eux, cherche du côté des entités accumulées ou d'un mod coûteux.`,
      section: 'config',
      severity: 'warning',
      evidence: m[0],
    }),
  },
]

/** Combien de lignes de journal on examine. Une pile Java est longue. */
const LOG_LINES = 400

/**
 * Sur un serveur en marche, on ne relit que la fin récente : l'incident qui
 * nous intéresse est en cours, et remonter 400 lignes ferait ressortir un
 * décrochage d'il y a deux heures comme s'il durait encore.
 */
const RUNNING_LOG_LINES = 60

export interface DiagnoseResult {
  /** Le serveur a-t-il un problème à signaler ? */
  healthy: boolean
  diagnoses: Diagnosis[]
  /** Le rapport de plantage exploité, pour pouvoir l'ouvrir en entier. */
  crashReport?: { filename: string; at: number } | null
}

/**
 * Traduit le rapport de plantage en diagnostics nominatifs.
 *
 * C'est la seule voie qui donne un nom de mod. Les motifs du journal, eux,
 * reconnaissent une *famille* de panne sans pouvoir dire lequel des cent
 * quarante mods installés en est responsable.
 */
function fromCrashReport(report: CrashReport): Diagnosis[] {
  return report.culprits.map((c) => {
    const nom = c.filename ?? c.modId

    if (c.clientOnly) {
      return {
        title: `« ${c.modId} » est un mod client`,
        detail:
          `Ce mod n'existe que du côté du joueur : il touche des classes que le ` +
          `serveur ne possède pas. Il a été mis dans le dossier mods par erreur — ` +
          `c'est la méprise la plus courante des packs assemblés à la main.`,
        fix: `Désactive « ${nom} » : le serveur redémarrera sans lui, et les joueurs pourront le garder de leur côté.`,
        section: 'files',
        severity: 'error',
        evidence: c.failure ?? undefined,
        action: c.filename
          ? { kind: 'disableMod', filename: c.filename, label: `Désactiver ${c.filename}` }
          : undefined,
      } satisfies Diagnosis
    }

    return {
      title: `« ${c.modId} » a fait planter le serveur`,
      detail: c.failure
        ? `Le rapport de plantage le désigne : ${c.failure}`
        : `Le rapport de plantage le désigne comme la cause du démarrage manqué.`,
      fix: c.filename
        ? `Désactive « ${c.filename} » pour vérifier, puis cherche-lui une version compatible.`
        : `Retire ou mets à jour « ${c.modId} » depuis l'onglet Contenu.`,
      section: 'files',
      severity: 'error',
      evidence: c.failure ?? undefined,
      action: c.filename
        ? { kind: 'disableMod', filename: c.filename, label: `Désactiver ${c.filename}` }
        : undefined,
    } satisfies Diagnosis
  })
}

export async function diagnoseServer(row: ServerRow): Promise<DiagnoseResult> {
  const status = await containerStatus(row.id)

  if (!status.exists) return { healthy: true, diagnoses: [] }

  // Un serveur qui tourne n'a pas de panne à expliquer — mais il peut décrocher
  // sans que rien ne s'arrête, et c'est précisément le cas qu'on ne remarque
  // pas tout seul.
  if (status.state === 'running' && !status.crashLooping) {
    const recent = await containerLogsTail(row.id, RUNNING_LOG_LINES).catch(() => '')
    const found: Diagnosis[] = []

    for (const pattern of RUNNING_PATTERNS) {
      const m = recent.match(pattern.test)
      if (m) found.push(pattern.build(m, { row }))
    }

    return { healthy: found.length === 0, diagnoses: found }
  }

  const diagnoses: Diagnosis[] = []

  // L'arrêt par le noyau ne laisse aucune trace dans le journal du jeu :
  // seul Docker le sait, et c'est une cause fréquente qu'on croirait autrement
  // être un plantage du serveur.
  if (status.oomKilled) {
    diagnoses.push({
      title: 'Le serveur a été tué par manque de mémoire',
      detail:
        `Le noyau a arrêté le conteneur parce qu'il dépassait sa limite. ` +
        `Ce n'est pas un plantage du jeu : il n'a pas eu son mot à dire.`,
      fix: "Augmente la mémoire de ce serveur, ou arrête un autre serveur pour lui laisser de la place.",
      severity: 'error',
    })
  }

  /**
   * Le rapport de plantage passe avant le journal.
   *
   * Il est plus complet — le journal du conteneur est tronqué — et surtout il
   * nomme le mod. Quand il a parlé, les motifs génériques n'ont plus rien à
   * ajouter : « le chargement des mods a échoué » après « c'est sodium » ne
   * fait que diluer la réponse.
   */
  const report = row.game === 'minecraft' ? await latestCrashReport(row).catch(() => null) : null
  if (report) diagnoses.push(...fromCrashReport(report))

  let log = ''
  try {
    log = await containerLogsTail(row.id, LOG_LINES)
  } catch {
    log = ''
  }

  if (log && !diagnoses.some((d) => d.action)) {
    for (const pattern of PATTERNS) {
      const m = log.match(pattern.test)
      if (!m) continue
      diagnoses.push(pattern.build(m, { row }))
      // Un seul diagnostic par cause : les motifs vont du précis au général,
      // et le premier qui accroche est le plus informatif.
      break
    }
  }

  if (status.crashLooping && !diagnoses.length) {
    diagnoses.push({
      title: 'Le serveur redémarre en boucle',
      detail:
        `Il s'arrête aussitôt lancé — ${status.restartCount} fois jusqu'ici — ` +
        `sans que la cause ait pu être identifiée automatiquement.`,
      fix: 'Ouvre la console : les dernières lignes avant l’arrêt disent pourquoi.',
      section: 'console',
      severity: 'error',
    })
  }

  return {
    healthy: diagnoses.length === 0,
    diagnoses,
    crashReport: report ? { filename: report.filename, at: report.at } : null,
  }
}
