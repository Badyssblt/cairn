export default defineEventHandler(async (event) => {
  const row = requireServerRow(getRouterParam(event, 'id')!)
  const status = await containerStatus(row.id)
  if (!status.exists || status.state === 'stopped') return { state: 'stopped' }

  // Arrêt propre : Java doit sauvegarder le monde avant de rendre la main.
  // Le socket RCON ne survivra pas à l'arrêt : on le lâche maintenant
  // plutôt que d'attendre qu'un appel échoue dessus.
  closeRcon(row.id)
  await stopContainer(row.id)
  return { state: 'stopped' }
})
