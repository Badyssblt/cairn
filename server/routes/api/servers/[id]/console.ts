import type { Peer } from 'crossws'

/**
 * CONSOLE — sortie par flux de logs Docker, entrée par RCON.
 *
 * Le flux n'est ouvert que tant qu'au moins un client regarde cette console,
 * et fermé dès le dernier départ. C'est la décision qui garde le panneau à
 * quelques dizaines de mégaoctets : N serveurs ne veulent pas dire N flux.
 */

interface Room {
  peers: Set<Peer>
  stop: () => void
}

const rooms = new Map<string, Room>()

/**
 * L'identifiant du serveur, depuis l'URL de la connexion.
 *
 * crossws ne fournit pas les paramètres de route d'un handler WebSocket :
 * l'URL se termine par « …/<id>/console », donc c'est l'avant-dernier segment
 * qu'il faut lire, pas le dernier.
 */
function serverIdOf(peer: Peer): string | null {
  const path = peer.request?.url
  if (!path) return null
  const segments = new URL(path, 'http://localhost').pathname.split('/').filter(Boolean)
  const last = segments.pop()
  return last === 'console' ? (segments.pop() ?? null) : null
}

function send(peer: Peer, type: string, data: unknown) {
  peer.send(JSON.stringify({ type, data }))
}

export default defineWebSocketHandler({
  async open(peer) {
    const id = serverIdOf(peer)
    if (!id) return peer.close(1008, 'Serveur inconnu')

    // Le middleware d'auth ne couvre pas la poignée de main WebSocket :
    // on revérifie la session ici, sans quoi la console serait ouverte à tous.
    const user = await userFromRequest(peer.request)
    if (!user) return peer.close(1008, 'Non authentifié')

    const row = getServerRow(id)
    if (!row) return peer.close(1008, 'Ce serveur n’existe pas.')

    peer.subscribe(id)

    const existing = rooms.get(id)
    if (existing) {
      existing.peers.add(peer)
      return
    }

    try {
      const stop = await followLogs(id, (line) => {
        peer.publish(id, JSON.stringify({ type: 'line', data: line }))
        send(peer, 'line', line)
      })
      rooms.set(id, { peers: new Set([peer]), stop })
    } catch {
      send(peer, 'error', "Le conteneur ne tourne pas : aucun journal à suivre.")
    }
  },

  async message(peer, message) {
    const id = serverIdOf(peer)
    if (!id) return

    const user = await userFromRequest(peer.request)
    if (!user) return peer.close(1008, 'Non authentifié')

    const row = getServerRow(id)
    if (!row) return

    const text = message.text().trim()
    if (!text) return

    const rcon = await serverRcon(row)
    if (!rcon) {
      return send(peer, 'error', 'Ce serveur ne tourne pas.')
    }

    try {
      const res = await rcon.command(text.replace(/^\//, ''))
      // La commande est renvoyée en écho : sans ça, une commande sans réponse
      // (comme `say`) donnerait l'impression que rien ne s'est passé.
      send(peer, 'echo', `> ${text}`)
      if (res.trim()) send(peer, 'reply', res.trim())
    } catch (e: any) {
      send(peer, 'error', `Échec de la commande : ${e?.message ?? 'erreur RCON'}`)
    }
  },

  close(peer) {
    for (const [id, room] of rooms) {
      if (!room.peers.delete(peer)) continue
      if (room.peers.size === 0) {
        room.stop()
        rooms.delete(id)
      }
    }
  },
})
