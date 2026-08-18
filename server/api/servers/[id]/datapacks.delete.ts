export default defineEventHandler(async (event) => {
  const row = requireServerRow(getRouterParam(event, 'id')!)
  const name = getQuery(event).name

  if (typeof name !== 'string' || !name) {
    throw createError({ statusCode: 400, statusMessage: 'Aucun datapack indiqué.' })
  }

  await removeDatapack(row, name)
  const reloaded = await reloadDatapacks(row)

  return { ok: true, reloaded }
})
