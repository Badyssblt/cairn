import type { MinecraftServer, Sample, ServerType } from '#shared/types'

export interface ServerRow {
  id: string
  name: string
  type: ServerType
  mc_version: string
  modpack_name: string | null
  modpack_source: string | null
  modpack_project: string | null
  modpack_version: string | null
  modpack_loader: string | null
  install_state: string | null
  install_step: string | null
  install_progress: number | null
  install_error: string | null
  loader: string | null
  loader_version: string | null
  disk_used_mb: number | null
  disk_checked_at: number | null
  icon_url: string | null
  game: string
  options: string | null
  cpu_limit: number | null
  disk_limit_mb: number | null
  host_port: number
  memory_mb: number
  rcon_password: string
  container_id: string | null
  data_dir: string
  created_at: number
}

/**
 * L'identifiant sert de nom de conteneur et de nom de dossier : il doit rester
 * lisible en ligne de commande, pas être un UUID qu'on ne peut pas retenir.
 */
export function slugify(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 32)
}

export function listServerRows(): ServerRow[] {
  return useDb()
    .prepare('SELECT * FROM servers ORDER BY created_at ASC')
    .all() as ServerRow[]
}

export function getServerRow(id: string): ServerRow | null {
  return (useDb().prepare('SELECT * FROM servers WHERE id = ?').get(id) as
    | ServerRow
    | undefined) ?? null
}

/** Lève 404 si le serveur n'existe pas. */
export function requireServerRow(id: string): ServerRow {
  const row = getServerRow(id)
  if (!row) {
    throw createError({ statusCode: 404, statusMessage: 'Ce serveur n’existe pas.' })
  }
  return row
}

export function portInUse(port: number, exceptId?: string): string | null {
  const row = useDb()
    .prepare(
      `SELECT name FROM servers WHERE host_port = ?${exceptId ? ' AND id != ?' : ''}`,
    )
    .get(...(exceptId ? [port, exceptId] : [port])) as { name: string } | undefined
  return row?.name ?? null
}

/* -- Échantillons (le tick ribbon) --------------------------------------- */

const RIBBON_SLOTS = 16

export function recentSamples(serverId: string, limit = RIBBON_SLOTS): Sample[] {
  const rows = useDb()
    .prepare(
      `SELECT ts, state, tps, mspt, players, max_players, ram_used_mb, cpu_percent
         FROM samples WHERE server_id = ?
        ORDER BY ts DESC LIMIT ?`,
    )
    .all(serverId, limit) as {
    ts: number
    state: Sample['state']
    tps: number | null
    mspt: number | null
    players: number | null
    max_players: number | null
    ram_used_mb: number | null
    cpu_percent: number | null
  }[]

  // Requête en ordre décroissant pour profiter de l'index, rendu en ordre
  // chronologique parce que le ribbon se lit de gauche à droite.
  return rows.reverse().map((r) => ({
    ts: r.ts,
    state: r.state,
    tps: r.tps,
    mspt: r.mspt,
    players: r.players,
    maxPlayers: r.max_players,
    ramUsedMb: r.ram_used_mb,
    cpuPercent: r.cpu_percent,
  }))
}

export function insertSample(serverId: string, s: Sample) {
  useDb()
    .prepare(
      `INSERT OR REPLACE INTO samples
         (server_id, ts, state, tps, mspt, players, max_players, ram_used_mb, cpu_percent)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      serverId, s.ts, s.state, s.tps, s.mspt, s.players,
      s.maxPlayers, s.ramUsedMb, s.cpuPercent,
    )
}

/** Rétention 24 h : au-delà, le ribbon ne montre plus rien de ces données. */
export function purgeOldSamples(maxAgeMs = 24 * 60 * 60 * 1000) {
  useDb()
    .prepare('DELETE FROM samples WHERE ts < ?')
    .run(Date.now() - maxAgeMs)
}

/* -- Vue métier ---------------------------------------------------------- */

/**
 * Assemble la vue envoyée à l'interface : la ligne en base, l'état réel du
 * conteneur et le dernier échantillon. L'état vient toujours de Docker, jamais
 * de la base — sinon un conteneur arrêté à la main mentirait dans le rack.
 */
export async function toMinecraftServer(row: ServerRow): Promise<MinecraftServer> {
  // Pendant l'installation, aucun conteneur n'existe encore : l'interroger
  // renverrait « arrêté », ce qui serait faux et déroutant.
  if (row.install_state === 'installing') {
    return {
      ...baseView(row),
      state: 'installing',
      players: null, maxPlayers: null, tps: null, mspt: null,
      ramUsedMb: null, cpuPercent: null,
      samples: recentSamples(row.id),
      diskUsedMb: row.disk_used_mb,
      startedAt: null,
      install: { step: row.install_step ?? 'Installation', progress: row.install_progress ?? 0 },
    }
  }

  const status = await containerStatus(row.id)
  const samples = recentSamples(row.id)
  const last = samples.at(-1)
  const live = status.state === 'running'

  return {
    ...baseView(row),
    state: status.exists ? status.state : 'stopped',
    players: live ? (last?.players ?? null) : null,
    maxPlayers: live ? (last?.maxPlayers ?? null) : null,
    tps: live ? (last?.tps ?? null) : null,
    mspt: live ? (last?.mspt ?? null) : null,
    ramUsedMb: live ? (last?.ramUsedMb ?? null) : null,
    cpuPercent: live ? (last?.cpuPercent ?? null) : null,
    diskUsedMb: row.disk_used_mb,
    startedAt: status.startedAt,
    crashLooping: status.crashLooping,
    restartCount: status.restartCount,
    samples,
  }
}

/** Les champs qui ne dépendent ni de Docker ni des relevés. */
function baseView(row: ServerRow) {
  return {
    id: row.id,
    name: row.name,
    type: row.type,
    mcVersion: row.mc_version,
    modpackName: row.modpack_name,
    modpackSource: row.modpack_source,
    iconUrl: row.icon_url,
    game: row.game,
    cpuLimit: row.cpu_limit,
    diskLimitMb: row.disk_limit_mb,
    hostPort: row.host_port,
    memoryMb: row.memory_mb,
    memoryLimitMb: containerMemoryMb(row.game, row.memory_mb),
    aikarFlags: serverOptions(row).aikarFlags === 'true',
    installError: row.install_error,
    install: null,
  }
}
