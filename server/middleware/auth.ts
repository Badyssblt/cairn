/**
 * Tout /api/** exige une session, sauf la poignée de routes qui servent
 * justement à en obtenir une. Liste blanche explicite : une nouvelle route
 * est protégée par défaut, jamais l'inverse.
 */
const PUBLIC = new Set([
  '/api/auth/state',
  '/api/auth/login',
  '/api/auth/setup',
  '/api/auth/logout',
])

export default defineEventHandler(async (event) => {
  const path = getRequestURL(event).pathname
  if (!path.startsWith('/api/')) return
  if (PUBLIC.has(path)) return

  await requireUser(event)
})
