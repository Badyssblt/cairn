import { existsSync } from 'node:fs'
import Docker from 'dockerode'
import type { Container } from 'dockerode'
import type { ServerState } from '#shared/types'

let instance: Docker | null = null

export function useDocker(): Docker {
  instance ??= new Docker({ socketPath: useRuntimeConfig().dockerSocket })
  return instance
}

/** Préfixe de nommage : rend nos conteneurs identifiables sur un hôte partagé. */
export const CONTAINER_PREFIX = 'mm-'
export const containerName = (serverId: string) => `${CONTAINER_PREFIX}${serverId}`

/**
 * Réseau dédié à tous les serveurs.
 *
 * Il existe pour RCON. Le port RCON n'est jamais publié sur l'hôte — ce serait
 * ouvrir une console d'administration par serveur — donc le panneau doit
 * joindre les conteneurs autrement. Un réseau utilisateur donne en prime la
 * résolution DNS par nom de conteneur entre membres, ce que le bridge par
 * défaut ne fait pas.
 */
export const NETWORK_NAME = 'minemanager'

export async function ensureNetwork() {
  const docker = useDocker()
  try {
    await docker.getNetwork(NETWORK_NAME).inspect()
  } catch (e: any) {
    if (e.statusCode !== 404) throw e
    await docker.createNetwork({ Name: NETWORK_NAME, Driver: 'bridge' })
  }
}

/**
 * Le panneau tourne-t-il lui-même dans un conteneur ?
 *
 * La réponse change la façon de joindre RCON, et les deux cas sont réels :
 * en production le panneau est un conteneur du réseau `minemanager`, en
 * développement c'est un process de l'hôte.
 */
let inContainer: boolean | null = null
function runningInContainer(): boolean {
  inContainer ??= existsSync('/.dockerenv')
  return inContainer
}

/**
 * Où joindre le RCON d'un serveur.
 *
 * Depuis un conteneur du même réseau, le nom suffit : le réseau utilisateur
 * fournit la résolution DNS. Depuis l'hôte, on passe par le port publié sur
 * 127.0.0.1 — on ne peut pas compter sur l'IP du bridge, qui n'est pas
 * routable quand Docker tourne dans une VM (Docker Desktop, WSL2).
 *
 * Le port hôte est attribué par Docker et lu à l'inspection : rien à allouer,
 * donc rien qui puisse entrer en collision.
 */
export async function rconEndpoint(
  serverId: string,
  rconPort: number,
): Promise<{ host: string; port: number } | null> {
  if (runningInContainer()) {
    return { host: containerName(serverId), port: rconPort }
  }
  try {
    const info = await getContainer(serverId).inspect()
    const binding = info.NetworkSettings?.Ports?.[`${rconPort}/tcp`]?.[0]
    if (!binding?.HostPort) return null
    return { host: '127.0.0.1', port: Number(binding.HostPort) }
  } catch {
    return null
  }
}

export function getContainer(serverId: string): Container {
  return useDocker().getContainer(containerName(serverId))
}

/* -- État ---------------------------------------------------------------- */

/**
 * Traduit l'état Docker en état métier. Docker distingue created/restarting/
 * paused/exited/dead ; l'interface n'a besoin que du sens.
 */
function toServerState(inspect: Docker.ContainerInspectInfo): ServerState {
  const s = inspect.State
  if (s.Restarting) return 'starting'
  if (s.Running) return s.Health?.Status === 'starting' ? 'starting' : 'running'
  if (s.Dead || (s.ExitCode !== 0 && s.Error)) return 'error'
  return 'stopped'
}

export interface ContainerStatus {
  exists: boolean
  state: ServerState
  startedAt: number | null
  exitCode: number | null
  /** Nombre de relances par la politique de redémarrage de Docker. */
  restartCount: number
  /**
   * Le noyau a-t-il tué le conteneur faute de mémoire ?
   *
   * Cette information n'existe que côté Docker : le jeu n'a pas le temps
   * d'écrire quoi que ce soit dans son journal, ce qui fait passer un arrêt
   * pour mémoire insuffisante pour un plantage ordinaire.
   */
  oomKilled: boolean
  /**
   * Le serveur repart-il en boucle sans tenir ?
   *
   * Docker relance nos conteneurs (`unless-stopped`), ce qui rend un serveur
   * qui plante au démarrage *invisible* : il est bien « en marche », mais il
   * ne le reste que quelques secondes. Beaucoup de relances ET un démarrage
   * tout récent, c'est une boucle — alors qu'un serveur sain relancé dix fois
   * en un mois affiche une longue durée de fonctionnement.
   */
  crashLooping: boolean
}

/** En dessous, le serveur n'a pas eu le temps de finir de démarrer. */
const SHORT_UPTIME_MS = 120_000
const LOOP_THRESHOLD = 3

export async function containerStatus(serverId: string): Promise<ContainerStatus> {
  try {
    const info = await getContainer(serverId).inspect()
    const startedAt = info.State.StartedAt ? Date.parse(info.State.StartedAt) : null
    const restartCount = info.RestartCount ?? 0
    const state = toServerState(info)

    const crashLooping =
      restartCount >= LOOP_THRESHOLD &&
      startedAt !== null &&
      Date.now() - startedAt < SHORT_UPTIME_MS

    return {
      exists: true,
      state: crashLooping ? 'error' : state,
      startedAt,
      exitCode: info.State.ExitCode ?? null,
      restartCount,
      crashLooping,
      oomKilled: Boolean(info.State.OOMKilled),
    }
  } catch (e: any) {
    if (e.statusCode === 404) {
      return {
        exists: false,
        state: 'stopped',
        startedAt: null,
        exitCode: null,
        restartCount: 0,
        crashLooping: false,
        oomKilled: false,
      }
    }
    throw e
  }
}

/* -- Cycle de vie -------------------------------------------------------- */

export interface CreateContainerOptions {
  serverId: string
  env: string[]
  dataDir: string
  /** Limite mémoire du conteneur, marge hors-tas comprise le cas échéant. */
  memoryLimitMb: number
  /** Image du jeu. */
  image: string
  /** Ports exposés et publiés, tels que l'adaptateur du jeu les déclare. */
  exposedPorts: Record<string, {}>
  portBindings: Record<string, unknown[]>
  /** Plafond CPU en cœurs (2 = deux cœurs). null = pas de limite. */
  cpuLimit?: number | null
}

export async function createContainer(opts: CreateContainerOptions) {
  // Docker traite une limite non numérique comme « aucune limite ». Une erreur
  // de calcul en amont retirerait donc le garde-fou mémoire sans rien signaler
  // — exactement le genre de panne qu'on ne découvre qu'à saturation de l'hôte.
  if (!Number.isFinite(opts.memoryLimitMb) || opts.memoryLimitMb <= 0) {
    throw new Error(
      `Limite mémoire invalide (${opts.memoryLimitMb}) pour ${opts.serverId}.`,
    )
  }

  await ensureNetwork()
  return useDocker().createContainer({
    name: containerName(opts.serverId),
    Image: opts.image,
    Env: opts.env,
    Labels: { 'minemanager.server': opts.serverId },
    NetworkingConfig: { EndpointsConfig: { [NETWORK_NAME]: {} } },
    // stdin ouvert : itzg accepte l'arrêt propre par la console.
    OpenStdin: true,
    Tty: false,
    ExposedPorts: opts.exposedPorts,
    HostConfig: {
      Binds: [`${opts.dataDir}:/data`],
      PortBindings: opts.portBindings,
      Memory: opts.memoryLimitMb * 1024 * 1024,
      // NanoCpus est un plafond dur : le conteneur ne dépassera pas cette
      // fraction de CPU, même si la machine est au repos. C'est ce qui évite
      // qu'un serveur qui s'emballe rende les autres injouables.
      ...(opts.cpuLimit ? { NanoCpus: Math.round(opts.cpuLimit * 1e9) } : {}),
      // Le serveur redémarre avec l'hôte, sauf s'il a été arrêté depuis le panneau.
      RestartPolicy: { Name: 'unless-stopped' },
      // Sans plafond, un serveur qui part en boucle noierait les logs de l'hôte.
      LogConfig: { Type: 'json-file', Config: { 'max-size': '20m', 'max-file': '3' } },
    },
  })
}

export async function startContainer(serverId: string) {
  await getContainer(serverId).start()
}

/** Arrêt propre : Java a besoin de temps pour sauvegarder le monde. */
export async function stopContainer(serverId: string, timeoutSec = 120) {
  await getContainer(serverId).stop({ t: timeoutSec })
}

export async function restartContainer(serverId: string, timeoutSec = 120) {
  await getContainer(serverId).restart({ t: timeoutSec })
}

export async function removeContainer(serverId: string) {
  try {
    await getContainer(serverId).remove({ force: true, v: false })
  } catch (e: any) {
    if (e.statusCode !== 404) throw e
  }
}

/* -- Image --------------------------------------------------------------- */

/**
 * Récupère l'image si elle manque. Le premier `docker pull` fait ~500 Mo :
 * on le déclenche explicitement pour pouvoir en rendre compte, au lieu de
 * laisser la création paraître figée.
 */
export async function ensureImage(
  image: string = MC_IMAGE,
  onProgress?: (line: string) => void,
) {
  const docker = useDocker()
  try {
    await docker.getImage(image).inspect()
    return { pulled: false }
  } catch (e: any) {
    if (e.statusCode !== 404) throw e
  }

  const stream = await docker.pull(image)
  await new Promise<void>((resolve, reject) => {
    docker.modem.followProgress(
      stream,
      (err) => (err ? reject(err) : resolve()),
      (event) => {
        if (onProgress && event.status) {
          onProgress(event.progress ? `${event.status} ${event.progress}` : event.status)
        }
      },
    )
  })
  return { pulled: true }
}

/* -- Mesures ------------------------------------------------------------- */

export interface ContainerStats {
  cpuPercent: number | null
  ramUsedMb: number | null
}

/**
 * Relevé unique (pas de flux). Docker ne donne que des compteurs cumulés :
 * le pourcentage CPU se calcule par différence avec le relevé précédent, que
 * l'API fournit dans `precpu_stats`.
 */
export async function containerStats(serverId: string): Promise<ContainerStats> {
  try {
    const s: any = await getContainer(serverId).stats({ stream: false })

    const cpuDelta =
      s.cpu_stats?.cpu_usage?.total_usage - s.precpu_stats?.cpu_usage?.total_usage
    const systemDelta =
      s.cpu_stats?.system_cpu_usage - s.precpu_stats?.system_cpu_usage
    const cores =
      s.cpu_stats?.online_cpus ?? s.cpu_stats?.cpu_usage?.percpu_usage?.length ?? 1

    const cpuPercent =
      cpuDelta > 0 && systemDelta > 0
        ? Math.round((cpuDelta / systemDelta) * cores * 1000) / 10
        : null

    // `cache` compte comme utilisée par Docker mais est récupérable : on l'ôte
    // pour refléter ce que le serveur occupe réellement.
    const used = s.memory_stats?.usage ?? 0
    const cache = s.memory_stats?.stats?.inactive_file ?? 0
    const ramUsedMb = used ? Math.round((used - cache) / 1024 / 1024) : null

    return { cpuPercent, ramUsedMb }
  } catch {
    return { cpuPercent: null, ramUsedMb: null }
  }
}

/* -- Logs ---------------------------------------------------------------- */

/**
 * Flux de logs. N'est ouvert que tant qu'une console est réellement affichée :
 * garder N flux permanents pour N serveurs coûterait sans rien apporter.
 * Renvoie une fonction d'arrêt.
 */
export async function followLogs(
  serverId: string,
  onLine: (line: string) => void,
  tail = 200,
): Promise<() => void> {
  const stream: NodeJS.ReadableStream = (await getContainer(serverId).logs({
    follow: true,
    stdout: true,
    stderr: true,
    tail,
  })) as any

  let buffer = ''
  const onData = (chunk: Buffer) => {
    // Flux multiplexé Docker : 8 octets d'en-tête par trame quand Tty=false.
    buffer += demultiplex(chunk)
    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''
    for (const line of lines) onLine(line)
  }

  stream.on('data', onData)

  return () => {
    stream.off('data', onData)
    ;(stream as any).destroy?.()
  }
}

/**
 * Dernières lignes du journal, en une fois.
 *
 * Distinct de `followLogs`, qui ouvre un flux : ici on veut une photo, pour
 * l'analyser puis refermer.
 */
export async function containerLogsTail(serverId: string, lines = 400): Promise<string> {
  const buf = (await getContainer(serverId).logs({
    stdout: true,
    stderr: true,
    tail: lines,
  })) as unknown as Buffer

  return demultiplex(Buffer.from(buf))
}

/** Retire les en-têtes de trame du flux multiplexé Docker. */
function demultiplex(chunk: Buffer): string {
  let out = ''
  let i = 0
  while (i < chunk.length) {
    // En-tête : [type, 0,0,0, taille sur 4 octets big-endian]
    if (chunk.length - i >= 8 && chunk[i]! <= 2 && chunk[i + 1] === 0) {
      const size = chunk.readUInt32BE(i + 4)
      out += chunk.subarray(i + 8, i + 8 + size).toString('utf8')
      i += 8 + size
    } else {
      out += chunk.subarray(i).toString('utf8')
      break
    }
  }
  return out
}
