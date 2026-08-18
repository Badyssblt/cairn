/**
 * CE QUE FONT LES RÉGLAGES DE server.properties
 *
 * Le fichier compte une soixantaine de clés, dont une dizaine décide de tout :
 * la difficulté ressentie, la charge du serveur, et qui peut entrer. Les
 * afficher comme le reste — une ligne de texte parmi soixante — laisse à
 * l'utilisateur le travail de savoir lesquelles comptent, et ce qu'elles
 * coûtent.
 *
 * Ce fichier ne décrit donc pas toutes les clés : seulement celles qu'on règle
 * vraiment, avec le type de contrôle qui leur convient et la conséquence dite
 * en clair. Les autres restent éditables en texte, comme avant.
 */

export interface PropertyMeta {
  key: string
  label: string
  /** Ce que ça change, du point de vue de qui joue ou qui héberge. */
  hint: string
  kind: 'boolean' | 'select' | 'number' | 'text'
  options?: { value: string; label: string }[]
  min?: number
  max?: number
  /** Regroupement dans l'interface. */
  group: 'jeu' | 'accès' | 'performance' | 'monde'
  /**
   * Avertissement affiché quand la valeur passe à celle indiquée. Réservé aux
   * réglages dont la conséquence n'est pas devinable depuis leur nom.
   */
  warnOn?: { value: string; message: string }
}

export const PROPERTY_META: PropertyMeta[] = [
  /* -- Jeu ---------------------------------------------------------------- */
  {
    key: 'difficulty',
    label: 'Difficulté',
    hint: "En paisible, les monstres n'apparaissent pas et la faim ne descend plus.",
    kind: 'select',
    group: 'jeu',
    options: [
      { value: 'peaceful', label: 'Paisible' },
      { value: 'easy', label: 'Facile' },
      { value: 'normal', label: 'Normal' },
      { value: 'hard', label: 'Difficile' },
    ],
  },
  {
    key: 'gamemode',
    label: 'Mode de jeu',
    hint: 'Le mode donné aux nouveaux arrivants. Les joueurs déjà venus gardent le leur.',
    kind: 'select',
    group: 'jeu',
    options: [
      { value: 'survival', label: 'Survie' },
      { value: 'creative', label: 'Créatif' },
      { value: 'adventure', label: 'Aventure' },
      { value: 'spectator', label: 'Spectateur' },
    ],
  },
  {
    key: 'hardcore',
    label: 'Extrême',
    hint: 'À la mort, le joueur passe en spectateur définitivement. Difficulté forcée à difficile.',
    kind: 'boolean',
    group: 'jeu',
    warnOn: {
      value: 'true',
      message:
        'En extrême, une mort est définitive pour le joueur concerné : il ne pourra plus réapparaître.',
    },
  },
  {
    key: 'pvp',
    label: 'Combat entre joueurs',
    hint: 'Désactivé, les joueurs ne peuvent plus se blesser entre eux.',
    kind: 'boolean',
    group: 'jeu',
  },
  {
    key: 'spawn-protection',
    label: 'Zone protégée au point d’apparition',
    hint: 'Rayon en blocs où seuls les opérateurs peuvent construire. 0 désactive la protection.',
    kind: 'number',
    min: 0,
    max: 256,
    group: 'jeu',
  },

  /* -- Accès -------------------------------------------------------------- */
  {
    key: 'max-players',
    label: 'Joueurs maximum',
    hint: 'Nombre de connexions simultanées acceptées.',
    kind: 'number',
    min: 1,
    max: 1000,
    group: 'accès',
  },
  {
    key: 'white-list',
    label: 'Liste blanche',
    hint: "Activée, seuls les joueurs de la liste peuvent entrer. La liste se remplit dans l'onglet Joueurs.",
    kind: 'boolean',
    group: 'accès',
  },
  {
    key: 'online-mode',
    label: 'Vérifier les comptes Mojang',
    hint: "Chaque joueur est authentifié auprès de Mojang à la connexion.",
    kind: 'boolean',
    group: 'accès',
    warnOn: {
      value: 'false',
      message:
        "N'importe qui peut alors se connecter sous n'importe quel pseudo, y compris le tien, " +
        'et récupérer ton inventaire et tes droits d’opérateur. Ne le désactive que si le serveur ' +
        'est injoignable depuis Internet, ou derrière un proxy qui authentifie à sa place.',
    },
  },
  {
    key: 'enforce-whitelist',
    label: 'Expulser les joueurs hors liste blanche',
    hint: 'Applique la liste blanche aux joueurs déjà connectés, et pas seulement aux nouvelles connexions.',
    kind: 'boolean',
    group: 'accès',
  },
  {
    key: 'motd',
    label: 'Message d’accueil',
    hint: 'La ligne affichée sous le nom du serveur, dans la liste multijoueur.',
    kind: 'text',
    group: 'accès',
  },

  /* -- Performance -------------------------------------------------------- */
  {
    key: 'view-distance',
    label: 'Distance d’affichage',
    hint:
      "Rayon de chunks envoyés à chaque joueur. C'est le réglage le plus coûteux du fichier : " +
      'la charge croît avec le carré de la valeur, donc passer de 10 à 20 la multiplie par quatre, ' +
      'pas par deux.',
    kind: 'number',
    min: 3,
    max: 32,
    group: 'performance',
  },
  {
    key: 'simulation-distance',
    label: 'Distance de simulation',
    hint:
      'Rayon où les mobs, plantes et mécanismes continuent de vivre. Le baisser en dessous de ' +
      "la distance d'affichage se voit peu et soulage beaucoup : au loin, le décor reste visible mais figé.",
    kind: 'number',
    min: 3,
    max: 32,
    group: 'performance',
  },
  {
    key: 'max-tick-time',
    label: 'Délai avant arrêt sur tick bloqué',
    hint:
      'Durée maximale (ms) qu’un tick peut prendre avant que le serveur se juge planté et s’arrête. ' +
      '-1 désactive ce chien de garde — utile sur un gros modpack dont le chargement dépasse la limite.',
    kind: 'number',
    min: -1,
    max: 600000,
    group: 'performance',
  },
  {
    key: 'entity-broadcast-range-percentage',
    label: 'Portée d’envoi des entités',
    hint: 'Pourcentage de la distance normale à laquelle les entités sont envoyées aux clients. Baisser allège le réseau.',
    kind: 'number',
    min: 10,
    max: 1000,
    group: 'performance',
  },

  /* -- Monde -------------------------------------------------------------- */
  {
    key: 'level-name',
    label: 'Monde chargé',
    hint: 'Nom du dossier du monde. Se change plus sûrement depuis l’onglet Mondes.',
    kind: 'text',
    group: 'monde',
  },
  {
    key: 'level-seed',
    label: 'Graine',
    hint: 'N’a d’effet qu’à la génération d’un monde neuf : sur un monde existant, la changer ne fait rien.',
    kind: 'text',
    group: 'monde',
  },
  {
    key: 'allow-nether',
    label: 'Nether',
    hint: 'Désactivé, les portails ne fonctionnent plus et la dimension devient inaccessible.',
    kind: 'boolean',
    group: 'monde',
  },
  {
    key: 'spawn-monsters',
    label: 'Apparition des monstres',
    hint: 'Sans effet en difficulté paisible, qui les empêche déjà.',
    kind: 'boolean',
    group: 'monde',
  },
  {
    key: 'allow-flight',
    label: 'Autoriser le vol',
    hint: 'À activer si un mod donne le vol : sinon le serveur expulse les joueurs qui volent, les prenant pour des tricheurs.',
    kind: 'boolean',
    group: 'monde',
  },
]

const BY_KEY = new Map(PROPERTY_META.map((m) => [m.key, m]))

export function propertyMeta(key: string): PropertyMeta | null {
  return BY_KEY.get(key) ?? null
}

export const PROPERTY_GROUPS: { id: PropertyMeta['group']; label: string }[] = [
  { id: 'jeu', label: 'Règles du jeu' },
  { id: 'accès', label: 'Accès au serveur' },
  { id: 'performance', label: 'Charge du serveur' },
  { id: 'monde', label: 'Monde' },
]
