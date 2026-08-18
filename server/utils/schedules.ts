import { randomBytes } from 'node:crypto'
import type { ServerRow } from './servers'

/**
 * TÂCHES PLANIFIÉES
 *
 * La cadence est décrite en clair — quotidien, hebdomadaire, toutes les N
 * heures — et non en cron. Écrire `0 4 * * *` est une compétence, pas une
 * intention ; les trois formes ci-dessous couvrent ce que l'on planifie
 * réellement sur un serveur de jeu, et se lisent sans documentation.
 */

export type ScheduleAction = 'backup' | 'restart' | 'stop' | 'start' | 'command'
export type Frequency = 'daily' | 'weekly' | 'interval'

export interface ScheduleRow {
  id: string
  server_id: string
  name: string
  action: ScheduleAction
  payload: string | null
  frequency: Frequency
  at_minute: number
  at_hour: number
  weekday: number | null
  every_hours: number | null
  enabled: number
  last_run_at: number | null
  last_status: string | null
  next_run_at: number | null
  created_at: number
  /** Minutes d'annonce avant une coupure. 0 = on coupe sans prévenir. */
  warn_minutes: number
  /** Renoncer plutôt que d'interrompre une partie en cours. */
  skip_if_players: number
  /** Reports consécutifs, pour ne pas repousser indéfiniment. */
  defer_count: number
}

export function listSchedules(serverId: string): ScheduleRow[] {
  return useDb()
    .prepare('SELECT * FROM schedules WHERE server_id = ? ORDER BY created_at ASC')
    .all(serverId) as ScheduleRow[]
}

/**
 * Prochaine exécution après un instant donné.
 *
 * On calcule toujours un horaire strictement futur : repartir de « maintenant »
 * sans cette garantie relancerait la tâche en boucle dans la minute qui suit.
 */
export function nextRun(s: Pick<ScheduleRow,
  'frequency' | 'at_hour' | 'at_minute' | 'weekday' | 'every_hours'>,
  from = Date.now(),
): number {
  const d = new Date(from)

  if (s.frequency === 'interval') {
    const hours = Math.max(1, s.every_hours ?? 6)
    return from + hours * 3600_000
  }

  const next = new Date(d)
  next.setSeconds(0, 0)
  next.setHours(s.at_hour, s.at_minute)

  if (s.frequency === 'weekly') {
    const target = s.weekday ?? 0
    let delta = (target - next.getDay() + 7) % 7
    if (delta === 0 && next.getTime() <= from) delta = 7
    next.setDate(next.getDate() + delta)
  } else if (next.getTime() <= from) {
    next.setDate(next.getDate() + 1)
  }

  return next.getTime()
}

export interface ScheduleInput {
  name: string
  action: ScheduleAction
  payload?: string | null
  frequency: Frequency
  atHour: number
  atMinute: number
  weekday?: number | null
  everyHours?: number | null
  enabled: boolean
  warnMinutes?: number
  skipIfPlayers?: boolean
}

export function createSchedule(serverId: string, input: ScheduleInput): string {
  const id = randomBytes(6).toString('hex')
  const spec = {
    frequency: input.frequency,
    at_hour: input.atHour,
    at_minute: input.atMinute,
    weekday: input.weekday ?? null,
    every_hours: input.everyHours ?? null,
  }

  useDb()
    .prepare(
      `INSERT INTO schedules
         (id, server_id, name, action, payload, frequency, at_minute, at_hour,
          weekday, every_hours, enabled, next_run_at, created_at,
          warn_minutes, skip_if_players)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      id, serverId, input.name, input.action, input.payload ?? null,
      input.frequency, input.atMinute, input.atHour,
      input.weekday ?? null, input.everyHours ?? null,
      input.enabled ? 1 : 0, nextRun(spec), Date.now(),
      interrupts(input.action) ? (input.warnMinutes ?? 0) : 0,
      interrupts(input.action) && input.skipIfPlayers ? 1 : 0,
    )
  return id
}

/** Les actions qui coupent la partie de quelqu'un, et elles seules. */
export function interrupts(action: ScheduleAction): boolean {
  return action === 'restart' || action === 'stop'
}

export function setScheduleEnabled(id: string, enabled: boolean) {
  const row = useDb().prepare('SELECT * FROM schedules WHERE id = ?').get(id) as
    | ScheduleRow
    | undefined
  if (!row) return

  useDb()
    .prepare('UPDATE schedules SET enabled = ?, next_run_at = ? WHERE id = ?')
    // Réactiver recalcule la prochaine échéance : garder l'ancienne
    // déclencherait la tâche immédiatement si elle était dépassée.
    .run(enabled ? 1 : 0, enabled ? nextRun(row) : null, id)
}

export function deleteSchedule(id: string) {
  useDb().prepare('DELETE FROM schedules WHERE id = ?').run(id)
}

/* -- Annonce avant coupure ------------------------------------------------ */

/**
 * Instants d'annonce, en secondes avant la coupure.
 *
 * On part du délai demandé puis on ne garde que des repères ronds : annoncer
 * toutes les minutes ferait du bruit, et un message qu'on lit six fois n'est
 * plus lu du tout. Le dernier à 10 s sert à ceux qui viennent d'arriver.
 */
const MARKS = [900, 600, 300, 120, 60, 10]

function countdownMarks(warnMinutes: number): number[] {
  const total = warnMinutes * 60
  return [...new Set([total, ...MARKS.filter((m) => m < total)])].sort((a, b) => b - a)
}

/** « 5 minutes », « 30 secondes » — jamais « 300 secondes ». */
function humanDelay(seconds: number): string {
  if (seconds % 60 === 0) {
    const m = seconds / 60
    return `${m} minute${m > 1 ? 's' : ''}`
  }
  return `${seconds} seconde${seconds > 1 ? 's' : ''}`
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, Math.max(0, ms)))

/**
 * Tâches dont le compte à rebours est en cours.
 *
 * L'échéance suivante est déjà inscrite en base quand le rebours démarre :
 * sans ce garde-fou, une tâche « toutes les heures » avec 15 minutes d'annonce
 * pourrait en lancer un second par-dessus le premier.
 *
 * Ce n'est volontairement qu'une mémoire de process : si le panneau redémarre
 * pendant un rebours, la coupure n'a pas lieu et la tâche reprend à l'échéance
 * suivante. Persister un état « en attente » ferait qu'un redémarrage du
 * panneau provoquerait le redémarrage du serveur au rattrapage, ce qui est le
 * contraire de ce qu'on veut.
 */
const counting = new Set<string>()

/**
 * Annonce la coupure aux joueurs, puis l'exécute à l'heure dite.
 *
 * Rendue non bloquante : la boucle de l'échantillonneur appelle
 * `runDueSchedules` toutes les 30 s et ne peut pas rester quinze minutes dans
 * une tâche.
 */
function countdownThenRun(row: ServerRow, s: ScheduleRow, actionAt: number) {
  counting.add(s.id)

  void (async () => {
    const verb = s.action === 'restart' ? 'Redémarrage' : 'Arrêt'
    const broadcast = gameAdapter(row.game).rcon?.broadcast

    for (const mark of countdownMarks(s.warn_minutes)) {
      const wait = actionAt - mark * 1000 - Date.now()

      // Échéance déjà dépassée — le panneau était arrêté à l'heure prévue.
      // Annoncer maintenant enverrait les quatre messages d'affilée, ce qui ne
      // prévient personne : on coupe sans rebours plutôt que de faire du bruit.
      if (wait < -1000) continue
      if (wait > 0) await sleep(wait)

      // Personne à prévenir : on saute l'annonce mais on garde l'horaire.
      // Décaler la coupure parce que le serveur s'est vidé surprendrait
      // quelqu'un qui se connecterait entre-temps.
      const rcon = broadcast ? await serverRcon(row).catch(() => null) : null
      if (!rcon) continue

      const players = await rcon.players().catch(() => null)
      if (!players || players.online === 0) continue

      await rcon
        .command(broadcast!(`${verb} du serveur dans ${humanDelay(mark)}`))
        .catch(() => {})
    }

    await sleep(actionAt - Date.now())

    let status: string
    try {
      status = await interrupt(row, s.action)
    } catch (e: any) {
      status = `échec : ${e?.message ?? 'erreur'}`
      console.error(`[schedules] ${s.id}:`, e)
    }

    counting.delete(s.id)
    recordRun(s.id, `${status} (annoncé ${s.warn_minutes} min à l'avance)`)
  })()
}

/* -- Exécution ------------------------------------------------------------ */

/** Le geste brut, sans annonce ni condition. */
async function interrupt(row: ServerRow, action: 'restart' | 'stop'): Promise<string> {
  const status = await containerStatus(row.id)
  if (!status.exists) return 'conteneur absent'

  if (action === 'stop') {
    if (status.state === 'stopped') return 'déjà arrêté'
    closeRcon(row.id)
    await stopContainer(row.id)
    return 'arrêté'
  }

  closeRcon(row.id)
  await restartContainer(row.id)
  return 'redémarré'
}

/** Un report d'une heure : assez pour laisser finir, assez court pour retenter. */
const DEFER_MS = 3600_000

/**
 * Au-delà, on renonce à l'occurrence du jour.
 *
 * Reporter sans fin sur un serveur toujours peuplé reviendrait à ne jamais
 * redémarrer, et à faire croire que la tâche fonctionne.
 */
const MAX_DEFERRALS = 6

function recordRun(id: string, status: string) {
  useDb()
    .prepare('UPDATE schedules SET last_run_at = ?, last_status = ? WHERE id = ?')
    .run(Date.now(), status, id)
}

async function runAction(row: ServerRow, s: ScheduleRow, actionAt: number): Promise<string | null> {
  switch (s.action) {
    case 'backup': {
      // Le champ libre porte l'étendue pour cette action : une sauvegarde
      // nocturne du monde seul pèse une fraction de l'archive complète, ce qui
      // change tout quand elle se répète chaque nuit.
      const scope = s.payload === 'world' ? 'world' : 'full'
      startBackup(row, `Automatique — ${s.name}`, scope)
      return scope === 'world' ? 'sauvegarde du monde lancée' : 'sauvegarde lancée'
    }
    case 'restart':
    case 'stop': {
      const status = await containerStatus(row.id)
      if (!status.exists) return 'conteneur absent'
      if (s.action === 'stop' && status.state === 'stopped') return 'déjà arrêté'

      // Renoncer plutôt qu'interrompre : on ne demande le nombre de joueurs
      // qu'à un serveur qui tourne, sinon la question n'a pas de sens.
      if (s.skip_if_players && status.state === 'running') {
        const rcon = await serverRcon(row).catch(() => null)
        const players = rcon ? await rcon.players().catch(() => null) : null

        if (players && players.online > 0) return defer(s, players.online)
      }

      const canAnnounce = Boolean(gameAdapter(row.game).rcon?.broadcast)
      if (s.warn_minutes > 0 && canAnnounce && status.state === 'running') {
        if (counting.has(s.id)) return 'compte à rebours déjà en cours'
        countdownThenRun(row, s, actionAt)
        // Le statut définitif sera écrit à la fin du rebours.
        return null
      }

      useDb().prepare('UPDATE schedules SET defer_count = 0 WHERE id = ?').run(s.id)
      return await interrupt(row, s.action)
    }
    case 'start': {
      const status = await containerStatus(row.id)
      if (!status.exists) return 'conteneur absent'
      if (status.state === 'running') return 'déjà en marche'
      await startContainer(row.id)
      return 'démarré'
    }
    case 'command': {
      const rcon = await serverRcon(row)
      if (!rcon) return 'serveur arrêté, commande ignorée'
      await rcon.command((s.payload ?? '').replace(/^\//, ''))
      return 'commande envoyée'
    }
  }
}

/**
 * Repousse l'occurrence d'une heure, ou renonce si on l'a déjà trop repoussée.
 *
 * Le compteur est remis à zéro dès qu'une exécution aboutit : ce sont bien les
 * reports *consécutifs* qui comptent, pas le total depuis la création.
 */
function defer(s: ScheduleRow, online: number): string {
  const count = s.defer_count + 1
  const joueurs = `${online} joueur${online > 1 ? 's' : ''} connecté${online > 1 ? 's' : ''}`

  if (count > MAX_DEFERRALS) {
    useDb()
      .prepare('UPDATE schedules SET defer_count = 0, next_run_at = ? WHERE id = ?')
      .run(nextRun(s, Date.now()), s.id)
    return `reporté ${MAX_DEFERRALS} fois (${joueurs}) — occurrence abandonnée`
  }

  useDb()
    .prepare('UPDATE schedules SET defer_count = ?, next_run_at = ? WHERE id = ?')
    .run(count, Date.now() + DEFER_MS, s.id)

  return `reporté d'une heure (${joueurs})`
}

/**
 * Exécute les tâches dont l'heure est venue.
 *
 * L'échéance suivante est calculée avant l'exécution : une tâche lente ne doit
 * pas décaler celles d'après, ni se relancer parce qu'elle a débordé.
 *
 * Une tâche qui annonce sa coupure est réveillée `warn_minutes` en avance :
 * l'annonce commence à ce moment-là et la coupure tombe à l'heure prévue, pas
 * après. C'est ce que promet le libellé « prévenir 5 minutes avant ».
 */
export async function runDueSchedules(now = Date.now()) {
  const due = useDb()
    .prepare(
      `SELECT * FROM schedules
        WHERE enabled = 1
          AND next_run_at - warn_minutes * 60000 <= ?`,
    )
    .all(now) as ScheduleRow[]

  for (const s of due) {
    // L'heure de l'action est l'échéance inscrite, pas l'instant du réveil :
    // repartir de « maintenant » sur une tâche réveillée en avance
    // recalculerait la même échéance et la relancerait en boucle.
    const actionAt = s.next_run_at ?? now
    useDb()
      .prepare('UPDATE schedules SET next_run_at = ? WHERE id = ?')
      .run(nextRun(s, Math.max(now, actionAt)), s.id)

    const row = getServerRow(s.server_id)
    if (!row) continue

    let status: string | null
    try {
      status = await runAction(row, s, actionAt)
    } catch (e: any) {
      status = `échec : ${e?.message ?? 'erreur'}`
      console.error(`[schedules] ${s.id}:`, e)
    }

    // `null` = un compte à rebours a pris le relais : il écrira le statut
    // lui-même quand la coupure aura eu lieu.
    if (status !== null) recordRun(s.id, status)
  }
}
