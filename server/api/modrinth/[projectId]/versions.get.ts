export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'projectId')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Modpack inconnu.' })
  return { versions: await modpackVersions(id) }
})
