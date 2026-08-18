export default defineEventHandler(async (event) => {
  const row = requireServerRow(getRouterParam(event, 'id')!)

  if (row.game !== 'minecraft') {
    throw createError({
      statusCode: 400,
      statusMessage: "La gestion des mondes est propre à Minecraft.",
    })
  }

  const status = await containerStatus(row.id)

  return {
    levelName: await levelName(row),
    worlds: await listWorlds(row),
    // La graine se demande au serveur : arrêté, il ne peut pas répondre. On
    // renvoie null plutôt que d'aller déchiffrer level.dat pour un agrément.
    seed: status.state === 'running' ? await worldSeed(row) : null,
    running: status.state === 'running',
  }
})
