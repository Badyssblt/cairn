export default defineEventHandler(async (event) => {
  const q = getQuery(event)
  return { modpacks: await searchCfModpacks(typeof q.q === 'string' ? q.q : '') }
})
