import type { ServerRow } from './servers'

/**
 * Création d'un conteneur à partir d'une ligne de serveur.
 *
 * Point de passage unique entre le registre des jeux et Docker : création,
 * import et mise à jour l'empruntent tous, ce qui garantit qu'un serveur est
 * reconstruit exactement comme il a été créé.
 */
export async function createServerContainer(row: ServerRow) {
  const adapter = gameAdapter(row.game)
  const ctx = gameContext(row)

  const image = adapter.image(ctx)
  await ensureImage(image)

  const { exposed, bindings } = portBindings(adapter, ctx, row.host_port)

  await createContainer({
    serverId: row.id,
    env: Object.entries(adapter.buildEnv(ctx)).map(([k, v]) => `${k}=${v}`),
    dataDir: row.data_dir,
    memoryLimitMb: containerMemoryMb(adapter.id, row.memory_mb),
    image,
    exposedPorts: exposed,
    portBindings: bindings,
    cpuLimit: row.cpu_limit,
  })

  return image
}

/** Refait le conteneur d'un serveur, en conservant son dossier de données. */
export async function recreateServerContainer(row: ServerRow) {
  closeRcon(row.id)
  await removeContainer(row.id)
  return await createServerContainer(row)
}

/**
 * Qui occupe quel port sur l'hôte.
 *
 * La base ne stocke que le port principal, ce qui ne suffit plus : un serveur
 * Valheim en occupe trois consécutifs. Sans cette vue complète, deux serveurs
 * pourraient se voir attribuer des plages qui se chevauchent, et la collision
 * n'apparaîtrait qu'au démarrage du second — avec un message Docker illisible.
 */
export function portOwners(exceptId?: string): Map<number, string> {
  const owners = new Map<number, string>()

  for (const row of listServerRows()) {
    if (row.id === exceptId) continue
    let ports: number[]
    try {
      ports = occupiedHostPorts(gameAdapter(row.game), gameContext(row), row.host_port)
    } catch {
      // Jeu retiré du registre : on retient au moins son port principal.
      ports = [row.host_port]
    }
    for (const p of ports) owners.set(p, row.name)
  }
  return owners
}
