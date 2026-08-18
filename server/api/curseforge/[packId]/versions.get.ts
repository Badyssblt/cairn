export default defineEventHandler(async (event) => {
  const packId = Number(getRouterParam(event, 'packId'))
  if (!Number.isFinite(packId)) {
    throw createError({ statusCode: 400, statusMessage: 'Modpack inconnu.' })
  }
  return { versions: await cfPackVersions(packId) }
})
