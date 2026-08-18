import { Rcon } from 'rcon-client'
import type { ServerRow } from './servers'

export interface RconEndpoint {
  host: string
  port: number
}

/**
 * RCON est le canal de commande du serveur Minecraft. Il n'est accessible que
 * sur 127.0.0.1, jamais depuis le réseau — ce serait exposer une console
 * d'administration par serveur.
 *
 * Les connexions sont maintenues ouvertes, une par serveur.
 *
 * Ce n'était pas le cas au départ, et l'échantillonneur ouvrait puis fermait
 * une connexion toutes les 30 s. Minecraft journalise chaque connexion et
 * chaque déconnexion RCON : la console de l'utilisateur se retrouvait noyée
 * sous nos propres relevés, à raison de deux lignes par demi-minute. Le
 * surcoût d'une connexion permanente est nul en comparaison.
 */
const pool = new Map<string, Promise<Rcon>>()

async function connection(
  serverId: string,
  ep: RconEndpoint,
  password: string,
): Promise<Rcon> {
  const existing = pool.get(serverId)
  if (existing) {
    try {
      return await existing
    } catch {
      pool.delete(serverId)
    }
  }

  const pending = Rcon.connect({
    host: ep.host,
    port: ep.port,
    password,
    timeout: 5000,
  })
  pool.set(serverId, pending)

  let rcon: Rcon
  try {
    rcon = await pending
  } catch (e) {
    pool.delete(serverId)
    throw e
  }

  // Un serveur qui redémarre coupe la connexion : on la retire du pool pour
  // que le prochain appel en rouvre une, au lieu de réutiliser un socket mort.
  const drop = () => {
    if (pool.get(serverId) === pending) pool.delete(serverId)
  }
  rcon.on('end', drop)
  rcon.on('error', drop)

  return rcon
}

export function closeRcon(serverId: string) {
  const pending = pool.get(serverId)
  pool.delete(serverId)
  pending?.then((r) => r.end()).catch(() => {})
}

export function closeAllRcon() {
  for (const id of [...pool.keys()]) closeRcon(id)
}

export async function rconCommand(
  serverId: string,
  ep: RconEndpoint,
  password: string,
  command: string,
): Promise<string> {
  try {
    return await (await connection(serverId, ep, password)).send(command)
  } catch {
    // Une seule reprise : la cause la plus fréquente est un socket devenu
    // invalide après un redémarrage, et elle se règle en rouvrant.
    closeRcon(serverId)
    return await (await connection(serverId, ep, password)).send(command)
  }
}

/**
 * Point d'entrée pour tout le reste du code : on parle d'un serveur, pas
 * d'une adresse. Renvoie null si le conteneur ne tourne pas.
 */
export async function serverRcon(row: ServerRow) {
  const adapter = gameAdapter(row.game)

  // Sans RCON, le jeu n'a pas de console interactive : on le dit plutôt que
  // de laisser l'appelant croire qu'il peut envoyer des commandes.
  if (!adapter.rcon) return null

  const ep = await rconEndpoint(row.id, adapter.rcon.port)
  if (!ep) return null

  const send = (cmd: string) => rconCommand(row.id, ep, row.rcon_password, cmd)

  return {
    command: send,

    /** Joueurs connectés. null si le serveur ne répond pas. */
    async players(): Promise<{ online: number; max: number } | null> {
      const spec = adapter.rcon!
      if (!spec.listCommand || !spec.parsePlayers) return null
      try {
        return spec.parsePlayers(await send(spec.listCommand))
      } catch {
        return null
      }
    },

    /**
     * TPS. null hors Paper : `tps` est une commande Paper/Spigot. On
     * n'interroge que les serveurs qui l'ont, pour ne pas provoquer un
     * aller-retour inutile toutes les 30 s.
     */
    async tps(): Promise<number | null> {
      // Le TPS n'a de sens que pour Minecraft, et seulement sur Paper.
      if (row.game !== 'minecraft' || !exposesTps(row.type)) return null
      try {
        const res = await send('tps')
        if (/unknown or incomplete command|<--\[HERE\]/i.test(res)) return null

        // Paper répond « TPS from last 1m, 5m, 15m: 20.0, 20.0, 20.0 ».
        const m = (res.split(':').pop() ?? res).match(/(\d+(?:[.,]\d+)?)/)
        if (!m) return null

        const tps = Number(m[1]!.replace(',', '.'))
        // Un serveur à 0 tps ne répondrait pas : c'est une lecture parasite.
        if (!Number.isFinite(tps) || tps <= 0) return null
        return Math.min(tps, 20)
      } catch {
        return null
      }
    },

    /**
     * Durée moyenne d'un tick, en millisecondes.
     *
     * Complément indispensable au TPS, qui sature à 20 : un serveur à 5 ms par
     * tick et un serveur à 45 ms affichent tous deux 20,0 alors que le second
     * n'a plus aucune marge. Paper seul expose la commande.
     */
    async mspt(): Promise<number | null> {
      const spec = adapter.rcon!
      if (!spec.msptCommand || !spec.parseMspt) return null
      if (row.game !== 'minecraft' || !exposesTps(row.type)) return null

      try {
        const res = await send(spec.msptCommand)
        if (/unknown or incomplete command|<--\[HERE\]/i.test(res)) return null
        return spec.parseMspt(res)
      } catch {
        return null
      }
    },
  }
}

/** Seul Paper (et ses dérivés) fournit `tps`. Vanilla, Forge et Fabric non. */
export function exposesTps(type: ServerRow['type']): boolean {
  return type === 'PAPER'
}
