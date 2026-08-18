import { hostname } from 'node:os'
import { createConnection } from 'node:net'

/**
 * L'ADRESSE QUE TES JOUEURS SAISISSENT
 *
 * Le panneau affichait jusqu'ici le nom d'hôte de la machine — utile pour
 * personne : un ami sur Internet ne peut pas résoudre « Badyss-PC ». C'est
 * pourtant l'information la plus consultée du tableau de bord.
 *
 * On prend donc, dans l'ordre : le domaine que tu as réglé, sinon l'adresse
 * publique de la machine, sinon le nom d'hôte en dernier recours.
 */

const TTL_MS = 6 * 60 * 60 * 1000
let ipCache: { at: number; ip: string | null } | null = null

async function publicIp(): Promise<string | null> {
  if (ipCache && Date.now() - ipCache.at < TTL_MS) return ipCache.ip

  let ip: string | null = null
  try {
    const res = await fetch('https://api.ipify.org', {
      signal: AbortSignal.timeout(5000),
    })
    if (res.ok) {
      const text = (await res.text()).trim()
      if (/^[\d.]+$|^[\da-f:]+$/i.test(text)) ip = text
    }
  } catch {
    ip = null
  }

  ipCache = { at: Date.now(), ip }
  return ip
}

export interface PublicAddress {
  host: string
  /** D'où vient cette adresse, pour pouvoir le dire à l'utilisateur. */
  source: 'domaine' | 'ip-publique' | 'nom-hote'
}

export async function publicAddress(): Promise<PublicAddress> {
  const configured = getSetting('public_host')?.trim()
  if (configured) return { host: configured, source: 'domaine' }

  const ip = await publicIp()
  if (ip) return { host: ip, source: 'ip-publique' }

  return { host: hostname(), source: 'nom-hote' }
}

/**
 * Le port répond-il localement ?
 *
 * Attention à ce que ça prouve : que le serveur écoute et que Docker publie
 * bien le port. Ça ne dit **rien** de la redirection de ports de ta box, qui
 * est la cause la plus fréquente d'un « mes amis n'arrivent pas à se
 * connecter ». On le dit explicitement plutôt que d'afficher un feu vert
 * trompeur.
 */
export function portResponds(port: number, timeoutMs = 2000): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = createConnection({ host: '127.0.0.1', port })
    const done = (ok: boolean) => {
      socket.destroy()
      resolve(ok)
    }
    socket.setTimeout(timeoutMs)
    socket.once('connect', () => done(true))
    socket.once('timeout', () => done(false))
    socket.once('error', () => done(false))
  })
}
