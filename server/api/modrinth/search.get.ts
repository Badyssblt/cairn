export default defineEventHandler(async (event) => {
  const q = getQuery(event)
  return await searchModpacks({
    query: typeof q.q === 'string' && q.q ? q.q : undefined,
    gameVersion: typeof q.version === 'string' && q.version ? q.version : undefined,
    page: Number(q.page) || 0,
  })
})
