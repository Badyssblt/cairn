import { z } from 'zod'

const Body = z.object({
  memoryMb: z.number().int().min(512).max(64 * 1024).optional(),
  aikarFlags: z.boolean().optional(),
  hostPort: z.number().int().min(1024).max(65535).optional(),
  /** Arrête d'abord le(s) serveur(s) qui occupent déjà le port demandé. */
  stopConflicting: z.boolean().optional().default(false),
})

/**
 * Change les ressources d'un serveur déjà créé.
 *
 * Mémoire, flags JVM et port sont figés dans le conteneur au moment de sa
 * création : les modifier impose de le refaire. C'est sans danger — le
 * dossier de données n'est pas touché, seul le conteneur est reconstruit par
 * `recreateServerContainer()` — mais ça coupe le serveur, donc on l'exige
 * arrêté plutôt que de le tuer sous les pieds de ses joueurs.
 */
export default defineEventHandler(async (event) => {
  const row = requireServerRow(getRouterParam(event, 'id')!)

  const parsed = Body.safeParse(await readBody(event))
  if (!parsed.success) {
    throw createError({ statusCode: 400, statusMessage: 'Requête invalide.' })
  }
  const input = parsed.data

  if (input.aikarFlags !== undefined && row.game !== 'minecraft') {
    throw createError({
      statusCode: 400,
      statusMessage: 'Les flags JVM ne concernent que Minecraft.',
    })
  }

  const status = await containerStatus(row.id)
  if (status.exists && status.state !== 'stopped') {
    throw createError({
      statusCode: 409,
      statusMessage:
        'Arrête le serveur avant de changer ses ressources : le conteneur doit être refait.',
    })
  }

  // La capacité se vérifie avant d'écrire : refuser après coup laisserait la
  // base annoncer une mémoire que le conteneur n'a jamais reçue.
  if (input.memoryMb !== undefined && input.memoryMb !== row.memory_mb) {
    assertMemoryAvailable(row.game, input.memoryMb, row.id)
  }

  if (input.hostPort !== undefined && input.hostPort !== row.host_port) {
    const adapter = gameAdapter(row.game)
    const draftCtx = { row: { ...row, host_port: input.hostPort }, options: serverOptions(row) }
    const owners = await portOwners(row.id)
    const conflicts = new Map<string, string>()
    for (const port of occupiedHostPorts(adapter, draftCtx, input.hostPort)) {
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
  }

  const options = serverOptions(row)
  if (input.aikarFlags !== undefined) {
    if (input.aikarFlags) options.aikarFlags = 'true'
    else delete options.aikarFlags
  }

  useDb()
    .prepare('UPDATE servers SET memory_mb = ?, options = ?, host_port = ? WHERE id = ?')
    .run(
      input.memoryMb ?? row.memory_mb,
      JSON.stringify(options),
      input.hostPort ?? row.host_port,
      row.id,
    )

  const updated = requireServerRow(row.id)
  if (status.exists) await recreateServerContainer(updated)

  return {
    ok: true,
    memoryMb: updated.memory_mb,
    memoryLimitMb: containerMemoryMb(updated.game, updated.memory_mb),
    aikarFlags: serverOptions(updated).aikarFlags === 'true',
    hostPort: updated.host_port,
  }
})
