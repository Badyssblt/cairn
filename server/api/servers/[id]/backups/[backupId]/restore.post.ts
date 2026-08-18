export default defineEventHandler(async (event) => {
  const row = requireServerRow(getRouterParam(event, 'id')!)
  const backup = getBackup(getRouterParam(event, 'backupId')!)
  if (!backup || backup.server_id !== row.id) {
    throw createError({ statusCode: 404, statusMessage: 'Sauvegarde introuvable.' })
  }
  if (backup.state !== 'done') {
    throw createError({
      statusCode: 409,
      statusMessage: "Cette sauvegarde n'est pas exploitable.",
    })
  }

  await restoreBackup(row, backup)
  // On ne redémarre pas : l'utilisateur vérifie l'état restauré avant de
  // relancer, comme après un import.
  return { ok: true, restarted: false }
})
