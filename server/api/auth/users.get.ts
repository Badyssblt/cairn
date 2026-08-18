/** Liste des comptes admin. Jamais le hash du mot de passe. */
export default defineEventHandler(async () => {
  const rows = useDb()
    .prepare('SELECT id, username, created_at FROM users ORDER BY created_at ASC')
    .all() as { id: number; username: string; created_at: number }[]

  return { users: rows.map((r) => ({ id: r.id, username: r.username, createdAt: r.created_at })) }
})
