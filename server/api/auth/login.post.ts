import { hash, verify } from '@node-rs/argon2'
import { z } from 'zod'

const Body = z.object({
  username: z.string().trim().min(1),
  password: z.string().min(1),
})

/**
 * Hash leurre, calculé une seule fois avec les mêmes paramètres que les vrais.
 * Quand l'identifiant n'existe pas, on vérifie quand même contre lui : sans ça
 * la réponse reviendrait instantanément et révélerait, au temps, quels comptes
 * existent. Un hash inventé en dur ne conviendrait pas — argon2 le rejetterait
 * au parsing, donc sans faire le travail qu'on cherche justement à imiter.
 */
let decoyHash: Promise<string> | null = null
function decoy() {
  decoyHash ??= hash('mot de passe leurre, jamais utilisé')
  return decoyHash
}

export default defineEventHandler(async (event) => {
  const parsed = Body.safeParse(await readBody(event))
  if (!parsed.success) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Renseigne un identifiant et un mot de passe.',
    })
  }

  const { username, password } = parsed.data
  const row = useDb()
    .prepare('SELECT id, username, password_hash FROM users WHERE username = ?')
    .get(username) as
    | { id: number; username: string; password_hash: string }
    | undefined

  // Le message reste le même dans les deux cas : il ne dit pas si le compte existe.
  const invalid = () =>
    createError({
      statusCode: 401,
      statusMessage: 'Identifiant ou mot de passe incorrect.',
    })

  if (!row) {
    await verify(await decoy(), password).catch(() => false)
    throw invalid()
  }

  const ok = await verify(row.password_hash, password).catch(() => false)
  if (!ok) throw invalid()

  const session = await useAuthSession(event)
  await session.update({ userId: row.id, username: row.username })

  return { user: { id: row.id, username: row.username } }
})
