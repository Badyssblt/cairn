import { randomBytes } from 'node:crypto'
import { createEvent, getSession } from 'h3'
import type { H3Event } from 'h3'

export interface SessionData {
  userId?: number
  username?: string
}

let devSecret: string | null = null

function secret(): string {
  const configured = useRuntimeConfig().sessionSecret
  if (configured && configured.length >= 32) return configured

  // En dev on ne bloque pas, mais les sessions ne survivent pas à un redémarrage.
  if (!devSecret) {
    devSecret = randomBytes(32).toString('hex')
    console.warn(
      '[cairn] NUXT_SESSION_SECRET absent ou trop court (32 caractères minimum).\n' +
        '              Secret temporaire généré : les sessions seront perdues au redémarrage.\n' +
        '              Génère-le avec : openssl rand -hex 32',
    )
  }
  return devSecret
}

/**
 * h3 pose `secure: true` par défaut sur le cookie de session, tout le temps —
 * y compris quand le panneau tourne encore en HTTP nu, avant qu'un reverse
 * proxy HTTPS ne soit en place. Un cookie `Secure` sur une origine HTTP n'est
 * pas juste ignoré : le navigateur refuse de le garder, donc la session ne
 * survit à aucune actualisation. `localhost` fait exception (contexte
 * sécurisé même en HTTP), ce qui masque le problème en dev.
 *
 * `getRequestProtocol` lit `X-Forwarded-Proto` : derrière un reverse proxy
 * qui termine le TLS, la connexion au panneau lui-même est en HTTP, mais la
 * requête d'origine était bien en HTTPS.
 */
export function useAuthSession(event: H3Event) {
  return useSession<SessionData>(event, {
    password: secret(),
    name: 'mm_session',
    cookie: { sameSite: 'lax', httpOnly: true, path: '/', secure: getRequestProtocol(event) === 'https' },
  })
}

/**
 * Renvoie l'utilisateur courant, ou null. Ne lève pas.
 *
 * Revérifie l'existence en base à chaque appel : le cookie de session est
 * signé mais ne sait pas qu'un compte a été supprimé depuis. Sans ce
 * contrôle, un admin retiré garderait un accès valide jusqu'à expiration du
 * cookie — exactement ce que la suppression est censée empêcher.
 */
export async function currentUser(event: H3Event) {
  const session = await useAuthSession(event)
  if (!session.data.userId) return null

  const row = useDb()
    .prepare('SELECT id, username FROM users WHERE id = ?')
    .get(session.data.userId) as { id: number; username: string } | undefined
  if (!row) return null

  return { id: row.id, username: row.username }
}

/** Exige une session. Lève 401 sinon. */
export async function requireUser(event: H3Event) {
  const user = await currentUser(event)
  if (!user) {
    throw createError({ statusCode: 401, statusMessage: 'Non authentifié' })
  }
  return user
}

/**
 * Identifie l'utilisateur derrière une connexion WebSocket.
 *
 * Le middleware d'authentification ne voit pas la poignée de main WebSocket,
 * et un peer crossws n'est pas un événement H3. On en reconstruit donc un,
 * minimal, à partir des en-têtes de la requête d'upgrade : cela réutilise
 * exactement le même déscellement de session que les routes HTTP, au lieu
 * d'inventer un second mécanisme d'authentification à maintenir en parallèle.
 */
export async function userFromRequest(request: Request | undefined) {
  const cookie = request?.headers?.get?.('cookie') ?? ''
  if (!cookie) return null

  const req = { headers: { cookie }, method: 'GET', url: '/' } as any
  // La lecture peut vouloir poser un cookie de session vide : on absorbe.
  const res = {
    setHeader() {},
    getHeader() {},
    removeHeader() {},
    hasHeader: () => false,
    headersSent: false,
    end() {},
  } as any

  try {
    const session = await getSession<SessionData>(createEvent(req, res), {
      password: secret(),
      name: 'mm_session',
    })
    if (!session.data.userId) return null

    const row = useDb()
      .prepare('SELECT id, username FROM users WHERE id = ?')
      .get(session.data.userId) as { id: number; username: string } | undefined
    if (!row) return null

    return { id: row.id, username: row.username }
  } catch {
    return null
  }
}
