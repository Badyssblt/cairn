import { mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import Database from 'better-sqlite3'

/**
 * Base mono-fichier. Les migrations sont un tableau ordonné appliqué dans une
 * transaction : pas d'outil de génération pour une base de cette taille, mais
 * un versionnage réel plutôt que des CREATE TABLE IF NOT EXISTS qui ne savent
 * jamais faire évoluer un schéma.
 */
const MIGRATIONS: string[] = [
  // 1 — socle
  `
  CREATE TABLE users (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    username     TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    created_at   INTEGER NOT NULL
  );

  CREATE TABLE settings (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  CREATE TABLE servers (
    id            TEXT PRIMARY KEY,
    name          TEXT NOT NULL UNIQUE,
    type          TEXT NOT NULL,
    mc_version    TEXT NOT NULL,
    modpack_name  TEXT,
    cf_slug       TEXT,
    cf_file_id    INTEGER,
    host_port     INTEGER NOT NULL UNIQUE,
    memory_mb     INTEGER NOT NULL,
    rcon_password TEXT NOT NULL,
    container_id  TEXT,
    data_dir      TEXT NOT NULL,
    created_at    INTEGER NOT NULL
  );

  -- Un échantillon = un bloc du tick ribbon. Rétention 24 h, purgée par le sampler.
  CREATE TABLE samples (
    server_id   TEXT NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
    ts          INTEGER NOT NULL,
    state       TEXT NOT NULL,
    tps         REAL,
    players     INTEGER,
    ram_used_mb INTEGER,
    PRIMARY KEY (server_id, ts)
  );

  CREATE INDEX idx_samples_server_ts ON samples(server_id, ts DESC);
  `,

  // 2 — `list` renvoie « x of a max of y » : garder le maximum évite de devoir
  //     relire server.properties pour afficher « 4/20 ».
  `ALTER TABLE samples ADD COLUMN max_players INTEGER;`,

  // 3 — `tps` n'existe que sur Paper/Spigot. Sur vanilla, la saturation CPU est
  //     le seul indicateur de tick disponible : sans elle le ribbon d'un
  //     serveur vanilla ne dirait rien d'autre que « allumé ».
  `ALTER TABLE samples ADD COLUMN cpu_percent REAL;`,

  // 4 — Modrinth devient la source de modpacks. Les colonnes étaient taillées
  //     pour CurseForge (`cf_file_id` en entier), or Modrinth identifie ses
  //     versions par une chaîne (« Lydu1ZNo »). On passe donc à un couple
  //     source/projet/version générique, valable pour les deux plateformes.
  `
  ALTER TABLE servers ADD COLUMN modpack_source  TEXT;
  ALTER TABLE servers ADD COLUMN modpack_project TEXT;
  ALTER TABLE servers ADD COLUMN modpack_version TEXT;
  ALTER TABLE servers ADD COLUMN modpack_loader  TEXT;

  UPDATE servers
     SET modpack_source  = 'CURSEFORGE',
         modpack_project = cf_slug,
         modpack_version = CAST(cf_file_id AS TEXT)
   WHERE cf_slug IS NOT NULL;

  ALTER TABLE servers DROP COLUMN cf_slug;
  ALTER TABLE servers DROP COLUMN cf_file_id;
  `,

  // 5 — Un modpack CurseForge se télécharge mod par mod : plusieurs minutes.
  //     La création ne peut donc pas être synchrone, et l'avancement doit
  //     survivre à un redémarrage du panneau — d'où un état en base plutôt
  //     qu'en mémoire.
  `
  ALTER TABLE servers ADD COLUMN install_state    TEXT;
  ALTER TABLE servers ADD COLUMN install_step     TEXT;
  ALTER TABLE servers ADD COLUMN install_progress INTEGER;
  ALTER TABLE servers ADD COLUMN install_error    TEXT;
  ALTER TABLE servers ADD COLUMN loader           TEXT;
  ALTER TABLE servers ADD COLUMN loader_version   TEXT;
  `,

  // 6 — La taille sur disque se calcule en parcourant l'arborescence, ce qui
  //     coûte cher sur un gros modpack. On la garde en base et on ne la
  //     recalcule que ponctuellement, au lieu de la mesurer à chaque affichage.
  `
  ALTER TABLE servers ADD COLUMN disk_used_mb   INTEGER;
  ALTER TABLE servers ADD COLUMN disk_checked_at INTEGER;
  `,

  // 7 — Vignette du serveur. Pour un modpack c'est son visuel officiel, ce qui
  //     donne à chaque serveur une identité reconnaissable dans le panneau.
  `ALTER TABLE servers ADD COLUMN icon_url TEXT;`,

  // 8 — Le panneau ne gère plus seulement Minecraft. Les serveurs existants
  //     en sont, d'où la valeur par défaut ; `options` porte les réglages
  //     propres à chaque jeu, dont la forme varie trop pour des colonnes.
  `
  ALTER TABLE servers ADD COLUMN game    TEXT NOT NULL DEFAULT 'minecraft';
  ALTER TABLE servers ADD COLUMN options TEXT;
  `,

  // 9 — Limites de ressources et sauvegardes.
  //
  //     `cpu_limit` est un vrai plafond appliqué par Docker. `disk_limit_mb`
  //     ne peut pas l'être : limiter la taille d'un montage exige un pilote
  //     de stockage particulier (xfs avec quotas de projet), qu'on ne peut
  //     pas supposer. C'est donc un seuil d'alerte, et il est présenté comme
  //     tel plutôt que de laisser croire à une barrière.
  `
  ALTER TABLE servers ADD COLUMN cpu_limit     REAL;
  ALTER TABLE servers ADD COLUMN disk_limit_mb INTEGER;

  CREATE TABLE backups (
    id         TEXT PRIMARY KEY,
    server_id  TEXT NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
    name       TEXT NOT NULL,
    path       TEXT NOT NULL,
    size_bytes INTEGER,
    state      TEXT NOT NULL,
    error      TEXT,
    created_at INTEGER NOT NULL
  );
  CREATE INDEX idx_backups_server ON backups(server_id, created_at DESC);

  CREATE TABLE schedules (
    id           TEXT PRIMARY KEY,
    server_id    TEXT NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
    name         TEXT NOT NULL,
    action       TEXT NOT NULL,
    payload      TEXT,
    -- Cadence décrite en clair (quotidien, hebdomadaire, toutes les N heures)
    -- plutôt qu'en cron : personne ne devrait avoir à écrire « 0 4 * * * ».
    frequency    TEXT NOT NULL,
    at_minute    INTEGER NOT NULL DEFAULT 0,
    at_hour      INTEGER NOT NULL DEFAULT 4,
    weekday      INTEGER,
    every_hours  INTEGER,
    enabled      INTEGER NOT NULL DEFAULT 1,
    last_run_at  INTEGER,
    last_status  TEXT,
    next_run_at  INTEGER,
    created_at   INTEGER NOT NULL
  );
  CREATE INDEX idx_schedules_next ON schedules(enabled, next_run_at);
  `,

  // 10 — Un redémarrage nocturne qui coupe la partie de quelqu'un est pire que
  //      pas de redémarrage du tout. Deux réglages suffisent à le rendre
  //      supportable : prévenir avant, et savoir renoncer.
  `
  ALTER TABLE schedules ADD COLUMN warn_minutes    INTEGER NOT NULL DEFAULT 0;
  ALTER TABLE schedules ADD COLUMN skip_if_players INTEGER NOT NULL DEFAULT 0;
  ALTER TABLE schedules ADD COLUMN defer_count     INTEGER NOT NULL DEFAULT 0;
  `,

  // 11 — Le TPS plafonne à 20 et n'en bouge plus : il ne dit rien de la marge
  //      restante. Le MSPT, lui, montre la durée réelle d'un tick — 25 ms sur
  //      un budget de 50 ms se lit comme « à moitié plein », là où le TPS
  //      affiche encore 20,0 et laisse croire que tout va bien.
  `ALTER TABLE samples ADD COLUMN mspt REAL;`,

  // 12 — Une archive du monde seul pèse une fraction de l'archive complète, et
  //      c'est celle qu'on restaure presque toujours. La distinction doit être
  //      visible dans la liste : restaurer l'une ou l'autre n'a pas du tout les
  //      mêmes conséquences sur les mods installés.
  `ALTER TABLE backups ADD COLUMN scope TEXT NOT NULL DEFAULT 'full';`,

  // 13 — Centre de notifications : les mêmes events qu'on annonce sur Discord
  //      (panne, boucle de redémarrage, sauvegarde ratée) vivent aussi dans le
  //      panneau, pour ne pas dépendre d'un webhook pour savoir ce qui s'est
  //      passé chez soi.
  `
  CREATE TABLE events (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    server_id  TEXT REFERENCES servers(id) ON DELETE CASCADE,
    level      TEXT NOT NULL,
    title      TEXT NOT NULL,
    detail     TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );
  CREATE INDEX idx_events_created ON events(created_at DESC);
  `,

  // 14 — Un port ne se publie qu'au démarrage du conteneur : un serveur
  //      arrêté ne doit plus le retenir pour toujours. La colonne était
  //      UNIQUE, ce que SQLite ne sait pas revenir en arrière sans recréer la
  //      table. `foreign_keys` est désactivé pendant les migrations (voir
  //      useDb ci-dessous) : sans ça, ce DROP TABLE viderait en cascade
  //      samples, backups, schedules et events.
  `
  CREATE TABLE servers_new (
    id            TEXT PRIMARY KEY,
    name          TEXT NOT NULL UNIQUE,
    type          TEXT NOT NULL,
    mc_version    TEXT NOT NULL,
    modpack_name  TEXT,
    host_port     INTEGER NOT NULL,
    memory_mb     INTEGER NOT NULL,
    rcon_password TEXT NOT NULL,
    container_id  TEXT,
    data_dir      TEXT NOT NULL,
    created_at    INTEGER NOT NULL,
    modpack_source  TEXT,
    modpack_project TEXT,
    modpack_version TEXT,
    modpack_loader  TEXT,
    install_state    TEXT,
    install_step     TEXT,
    install_progress INTEGER,
    install_error    TEXT,
    loader           TEXT,
    loader_version   TEXT,
    disk_used_mb   INTEGER,
    disk_checked_at INTEGER,
    icon_url TEXT,
    game    TEXT NOT NULL DEFAULT 'minecraft',
    options TEXT,
    cpu_limit     REAL,
    disk_limit_mb INTEGER
  );

  INSERT INTO servers_new SELECT
    id, name, type, mc_version, modpack_name, host_port, memory_mb,
    rcon_password, container_id, data_dir, created_at,
    modpack_source, modpack_project, modpack_version, modpack_loader,
    install_state, install_step, install_progress, install_error,
    loader, loader_version, disk_used_mb, disk_checked_at, icon_url,
    game, options, cpu_limit, disk_limit_mb
  FROM servers;

  DROP TABLE servers;
  ALTER TABLE servers_new RENAME TO servers;
  `,
]

let instance: Database.Database | null = null

export function useDb(): Database.Database {
  if (instance) return instance

  const path = resolve(useRuntimeConfig().dbPath)
  mkdirSync(dirname(path), { recursive: true })

  const db = new Database(path)
  db.pragma('journal_mode = WAL')

  // Désactivées pendant la migration, pas seulement laissées à leur défaut :
  // better-sqlite3 les active d'emblée sur une nouvelle connexion. Sans ce
  // OFF explicite, la migration 14 (qui recrée `servers` via DROP + RENAME)
  // viderait en cascade samples/backups/schedules/events.
  db.pragma('foreign_keys = OFF')
  migrate(db)
  db.pragma('foreign_keys = ON')

  instance = db
  return db
}

function migrate(db: Database.Database) {
  const current = db.pragma('user_version', { simple: true }) as number

  for (let v = current; v < MIGRATIONS.length; v++) {
    db.transaction(() => {
      db.exec(MIGRATIONS[v]!)
      db.pragma(`user_version = ${v + 1}`)
    })()
  }
}

/* -- Réglages : clé/valeur typée en lecture ------------------------------- */

export function getSetting(key: string): string | null {
  const row = useDb()
    .prepare('SELECT value FROM settings WHERE key = ?')
    .get(key) as { value: string } | undefined
  return row?.value ?? null
}

export function setSetting(key: string, value: string): void {
  useDb()
    .prepare(
      `INSERT INTO settings (key, value) VALUES (?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    )
    .run(key, value)
}

export function countUsers(): number {
  return (
    useDb().prepare('SELECT COUNT(*) AS n FROM users').get() as { n: number }
  ).n
}
