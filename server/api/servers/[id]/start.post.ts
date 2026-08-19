import { z } from 'zod'

const Body = z.object({
  /** Arrête d'abord le(s) serveur(s) qui occupent déjà le port de celui-ci. */
  stopConflicting: z.boolean().optional().default(false),
})

export default defineEventHandler(async (event) => {
  const row = requireServerRow(getRouterParam(event, 'id')!)
  const input = Body.parse(await readBody(event).catch(() => ({})))

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

  // Un port ne se publie qu'au démarrage : un autre serveur peut très bien le
  // détenir en base sans le bloquer, tant qu'il est arrêté. On ne vérifie donc
  // les vrais occupants qu'ici, contre ce qui tourne réellement.
  const adapter = gameAdapter(row.game)
  const owners = await portOwners(row.id)
  const conflicts = new Map<string, string>() // id -> name
  for (const port of occupiedHostPorts(adapter, gameContext(row), row.host_port)) {
    const taken = owners.get(port)
    if (!taken) continue
    if (!input.stopConflicting) {
      throw createError({
        statusCode: 409,
        statusMessage: `Le port ${port} est déjà utilisé par « ${taken.name} », en marche.`,
        data: { conflictId: taken.id, conflictName: taken.name, port },
      })
    }
    conflicts.set(taken.id, taken.name)
  }
  for (const conflictId of conflicts.keys()) {
    closeRcon(conflictId)
    await stopContainer(conflictId)
  }

  await startContainer(row.id)
  return { state: 'starting' }
})
