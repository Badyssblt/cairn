export default defineEventHandler(async (event) => {
  const row = requireServerRow(getRouterParam(event, 'id')!)
  const backup = getBackup(getRouterParam(event, 'backupId')!)
  if (!backup || backup.server_id !== row.id) {
    throw createError({ statusCode: 404, statusMessage: 'Sauvegarde introuvable.' })
  }
  await deleteBackup(backup)
  return { ok: true }
})
