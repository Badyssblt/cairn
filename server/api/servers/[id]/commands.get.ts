/**
 * Journal des commandes d'admin (« qui a fait quoi ») pour un serveur
 * Minecraft. Voir server/utils/commandLog.ts pour la façon dont ces lignes
 * sont interceptées.
 */
export default defineEventHandler((event) => {
  const row = requireServerRow(getRouterParam(event, 'id')!)

  if (row.game !== 'minecraft') {
    throw createError({
      statusCode: 400,
      statusMessage: 'Le journal des commandes est spécifique à Minecraft.',
    })
  }

  const limit = Math.min(500, Math.max(1, Number(getQuery(event).limit) || 200))

  return {
    entries: recentCommands(row.id, limit),
    summary: commandSummary(row.id),
  }
})
