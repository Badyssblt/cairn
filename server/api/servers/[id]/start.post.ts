export default defineEventHandler(async (event) => {
  const row = requireServerRow(getRouterParam(event, 'id')!)

  // La capacité peut avoir changé depuis la création (autre serveur démarré,
  // réserve modifiée) : on revérifie au démarrage, pas seulement à la création.
  assertMemoryAvailable(row.game, row.memory_mb, row.id)

  const status = await containerStatus(row.id)
  if (!status.exists) {
    throw createError({
      statusCode: 409,
      statusMessage:
        'Le conteneur de ce serveur a disparu. Supprime-le et recrée-le.',
    })
  }
  if (status.state === 'running') return { state: 'running' }

  await startContainer(row.id)
  return { state: 'starting' }
})
