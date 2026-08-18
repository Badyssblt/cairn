export default defineEventHandler(async (event) => {
  const row = requireServerRow(getRouterParam(event, 'id')!)
  const path = getQuery(event).path
  if (typeof path !== 'string' || !path) {
    throw createError({ statusCode: 400, statusMessage: 'Aucun fichier indiqué.' })
  }
  await deleteEntry(row.data_dir, path)
  return { ok: true }
})
