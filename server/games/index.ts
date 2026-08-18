import type { GameAdapter, GameContext, PortSpec } from './types'
import type { ServerRow } from '../utils/servers'
import { minecraft, minecraftContainerMemoryMb as minecraftMemory } from './minecraft'
import { valheim } from './valheim'
import { palworld } from './palworld'
import { factorio } from './factorio'
import { sevenDaysToDie } from './sevendays'
import { linuxgsm } from './linuxgsm'

export type { GameAdapter, GameContext, GameField, PortSpec } from './types'

/**
 * Registre des jeux gérés.
 *
 * L'ordre est celui de l'interface : Minecraft d'abord parce que c'est le
 * cœur historique du panneau et le seul à disposer de catalogues de contenu.
 */
const ADAPTERS: GameAdapter[] = [
  minecraft,
  valheim,
  palworld,
  factorio,
  sevenDaysToDie,
  // En dernier : c'est le filet générique, pas un jeu de première classe.
  linuxgsm,
]

const BY_ID = new Map(ADAPTERS.map((a) => [a.id, a]))

export const gameAdapters = () => ADAPTERS

export function gameAdapter(id: string): GameAdapter {
  const adapter = BY_ID.get(id)
  if (!adapter) {
    throw createError({
      statusCode: 400,
      statusMessage: `Jeu inconnu : « ${id} ».`,
    })
  }
  return adapter
}

/** Réglages propres au jeu, stockés en JSON sur la ligne du serveur. */
export function serverOptions(row: ServerRow): Record<string, string> {
  try {
    return row.options ? JSON.parse(row.options) : {}
  } catch {
    return {}
  }
}

export function gameContext(row: ServerRow): GameContext {
  return { row, options: serverOptions(row) }
}

/**
 * Mémoire à donner au conteneur.
 *
 * Minecraft a besoin d'une marge au-dessus du tas Java, que la JVM consomme
 * hors-tas. Les autres jeux n'ont pas cette distinction : la valeur demandée
 * est la limite.
 */
export function containerMemoryMb(gameId: string, requestedMb: number): number {
  return gameId === 'minecraft' ? minecraftMemory(requestedMb) : requestedMb
}

/** Fichier de configuration du serveur, ou null si le jeu n'en déclare pas. */
export function gameConfigFile(adapter: GameAdapter, ctx: GameContext) {
  const c = adapter.configFile
  if (!c) return null
  return typeof c === 'function' ? c(ctx) : c
}

/** Traduit les ports déclarés par le jeu en publications Docker. */
export function portBindings(
  adapter: GameAdapter,
  ctx: GameContext,
  hostPort: number,
): { exposed: Record<string, {}>; bindings: Record<string, unknown[]> } {
  const exposed: Record<string, {}> = {}
  const bindings: Record<string, unknown[]> = {}

  for (const p of adapter.ports(ctx)) {
    const key = `${p.container}/${p.protocol}`
    exposed[key] = {}
    bindings[key] = [
      p.loopbackOnly
        ? // Port d'administration : Docker choisit un port libre sur la boucle
          // locale, personne d'autre ne peut l'atteindre.
          { HostIp: '127.0.0.1', HostPort: '' }
        : { HostPort: String(hostPort + p.offset) },
    ]
  }

  return { exposed, bindings }
}

/** Les ports que l'utilisateur occupe réellement sur l'hôte, pour éviter les collisions. */
export function occupiedHostPorts(adapter: GameAdapter, ctx: GameContext, hostPort: number) {
  return adapter
    .ports(ctx)
    .filter((p: PortSpec) => !p.loopbackOnly)
    .map((p) => hostPort + p.offset)
}
