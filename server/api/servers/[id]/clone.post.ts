import { randomBytes } from 'node:crypto'
import { cp, mkdir } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { z } from 'zod'

const Body = z.object({
  name: z.string().trim().min(2).max(40),
  hostPort: z.number().int().min(1024).max(65535),
  /** Copier aussi le monde, ou repartir d'une carte vierge. */
  withWorld: z.boolean().default(false),
})

/**
 * Duplique un serveur.
 *
 * Sert surtout à éprouver une mise à jour de modpack sans risquer le monde
 * principal : on clone, on met à jour la copie, et on ne touche à l'original
 * que si tout se passe bien.
 */
export default defineEventHandler(async (event) => {
  const source = requireServerRow(getRouterParam(event, 'id')!)

  const parsed = Body.safeParse(await readBody(event))
  if (!parsed.success) {
    throw createError({
      statusCode: 400,
      statusMessage: parsed.error.issues[0]?.message ?? 'Formulaire incomplet.',
    })
  }
  const input = parsed.data

  const id = slugify(input.name)
  if (!id || getServerRow(id)) {
    throw createError({
      statusCode: 409,
      statusMessage: `Un serveur porte déjà ce nom, ou le nom est invalide.`,
    })
  }

  const adapter = gameAdapter(source.game)
  const owners = await portOwners()
  for (const port of occupiedHostPorts(adapter, gameContext(source), input.hostPort)) {
    const taken = owners.get(port)
    if (taken) {
      throw createError({
        statusCode: 409,
        statusMessage: `Le port ${port} est déjà utilisé par « ${taken.name} », en marche.`,
        data: { conflictId: taken.id, conflictName: taken.name, port },
      })
    }
  }

  assertMemoryAvailable(source.game, source.memory_mb)

  const dataDir = join(resolve(useRuntimeConfig().dataRoot), id)
  await mkdir(dataDir, { recursive: true })

  // Le monde est de loin le plus volumineux : le copier est un choix, pas
  // un défaut, pour que cloner reste rapide quand on veut juste tester.
  const props = await readProperties(source.data_dir)
  const levelName = props.find((p) => p.key === 'level-name')?.value || 'world'

  await cp(resolve(source.data_dir), dataDir, {
    recursive: true,
    filter: (src) => {
      if (input.withWorld) return true
      const rel = src.slice(resolve(source.data_dir).length + 1)
      return !(rel === levelName || rel.startsWith(`${levelName}/`) || rel.startsWith(`${levelName}_`))
    },
  })

  useDb()
    .prepare(
      `INSERT INTO servers
         (id, game, name, type, mc_version, modpack_name, modpack_source,
          modpack_project, modpack_version, modpack_loader, host_port, memory_mb,
          rcon_password, data_dir, created_at, loader, loader_version, options,
          icon_url, cpu_limit, disk_limit_mb)
       SELECT ?, game, ?, type, mc_version, modpack_name, modpack_source,
              modpack_project, modpack_version, modpack_loader, ?, memory_mb,
              ?, ?, ?, loader, loader_version, options,
              icon_url, cpu_limit, disk_limit_mb
         FROM servers WHERE id = ?`,
    )
    .run(
      id, input.name, input.hostPort,
      randomBytes(24).toString('base64url'), dataDir, Date.now(), source.id,
    )

  const row = requireServerRow(id)
  await createServerContainer(row)

  // Pas de démarrage automatique : deux serveurs identiques qui partent
  // ensemble doubleraient la charge sans prévenir.
  return { server: await toMinecraftServer(row) }
})
