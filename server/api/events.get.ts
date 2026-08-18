/** Historique du centre de notifications, le plus récent d'abord. */
export default defineEventHandler(async (event) => {
  const q = getQuery(event)
  const limit = Math.min(100, Math.max(1, Number(q.limit) || 30))
  return { events: recentEvents(limit) }
})
