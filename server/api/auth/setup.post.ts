import { hash } from '@node-rs/argon2'
import { z } from 'zod'

const Body = z.object({
  username: z.string().trim().min(3).max(32),
  password: z.string().min(10).max(200),
})

/**
 * Crée le compte admin. N'est ouvert que tant qu'aucun compte n'existe :
 * une fois le premier créé, la route est définitivement fermée.
 */
export default defineEventHandler(async (event) => {
  if (countUsers() > 0) {
    throw createError({
      statusCode: 409,
      statusMessage: 'Un compte administrateur existe déjà.',
    })
  }

  const parsed = Body.safeParse(await readBody(event))
  if (!parsed.success) {
    throw createError({
      statusCode: 400,
      statusMessage:
        "L'identifiant fait 3 caractères minimum, le mot de passe 10.",
    })
  }

  const { username, password } = parsed.data
  const info = useDb()
    .prepare(
      'INSERT INTO users (username, password_hash, created_at) VALUES (?, ?, ?)',
    )
    .run(username, await hash(password), Date.now())

  const session = await useAuthSession(event)
  await session.update({ userId: Number(info.lastInsertRowid), username })

  return { user: { id: Number(info.lastInsertRowid), username } }
})
