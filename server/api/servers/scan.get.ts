export default defineEventHandler(async (event) => {
  const q = getQuery(event)
  const path = typeof q.path === 'string' && q.path ? q.path : useRuntimeConfig().dataRoot

  // Un chemin précis est inspecté seul ; sinon on parcourt les sous-dossiers.
  if (q.single === 'true') {
    return { candidates: [await detectServer(path)] }
  }
  return { candidates: await scanForServers(path) }
})
