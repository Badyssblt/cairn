import { hash } from '@node-rs/argon2'
import { z } from 'zod'

const Body = z.object({
  username: z.string().trim().min(3).max(32),
  password: z.string().min(10).max(200),
})

/**
 * Ajoute un compte admin supplémentaire. Contrairement à `setup.post.ts`,
 * cette route reste ouverte après la première installation — c'est
 * justement le moyen d'en créer d'autres. Ne touche pas à la session de
 * l'appelant : le nouveau compte doit se connecter lui-même.
 */
export default defineEventHandler(async (event) => {
  const parsed = Body.safeParse(await readBody(event))
  if (!parsed.success) {
    throw createError({
      statusCode: 400,
      statusMessage: "L'identifiant fait 3 caractères minimum, le mot de passe 10.",
    })
  }

  const { username, password } = parsed.data

  try {
    const info = useDb()
      .prepare(
        'INSERT INTO users (username, password_hash, created_at) VALUES (?, ?, ?)',
      )
      .run(username, await hash(password), Date.now())

    return {
      user: { id: Number(info.lastInsertRowid), username, createdAt: Date.now() },
    }
  } catch (e: any) {
    if (e?.code === 'SQLITE_CONSTRAINT_UNIQUE' || e?.code === 'SQLITE_CONSTRAINT') {
      throw createError({ statusCode: 409, statusMessage: 'Cet identifiant est déjà pris.' })
    }
    throw e
  }
})
