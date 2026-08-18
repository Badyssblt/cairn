export default defineEventHandler(async (event) => {
  const row = requireServerRow(getRouterParam(event, 'id')!)
  const status = await containerStatus(row.id)
  if (!status.exists) {
    throw createError({
      statusCode: 409,
      statusMessage: 'Le conteneur de ce serveur a disparu. Supprime-le et recrée-le.',
    })
  }
  // Le socket RCON ne survivra pas à l'arrêt : on le lâche maintenant
  // plutôt que d'attendre qu'un appel échoue dessus.
  closeRcon(row.id)
  await restartContainer(row.id)
  return { state: 'starting' }
})
