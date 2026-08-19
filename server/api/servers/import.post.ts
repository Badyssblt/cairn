import { randomBytes } from 'node:crypto'
import { z } from 'zod'

const Body = z.object({
  path: z.string().trim().min(1),
  name: z.string().trim().min(2).max(40),
  memoryMb: z.number().int().min(512).max(64 * 1024),
  hostPort: z.number().int().min(1024).max(65535),
})

/**
 * Adopte un serveur déjà présent sur la machine.
 *
 * Le dossier reste où il est : on ne déplace ni ne copie rien, on crée un
 * conteneur monté dessus. Un import raté ne peut donc pas abîmer le monde,
 * et désadopter revient simplement à supprimer le conteneur.
 */
export default defineEventHandler(async (event) => {
  const parsed = Body.safeParse(await readBody(event))
  if (!parsed.success) {
    throw createError({
      statusCode: 400,
      statusMessage: parsed.error.issues[0]?.message ?? 'Formulaire incomplet.',
    })
  }
  const input = parsed.data

  const detected = await detectServer(input.path)
  if (detected.problem) {
    throw createError({ statusCode: 400, statusMessage: detected.problem })
  }

  const id = slugify(input.name)
  if (!id) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Le nom doit contenir au moins une lettre ou un chiffre.',
    })
  }
  if (getServerRow(id)) {
    throw createError({
      statusCode: 409,
      statusMessage: `Un serveur porte déjà le nom « ${input.name} ».`,
    })
  }

  const already = useDb()
    .prepare('SELECT name FROM servers WHERE data_dir = ?')
    .get(detected.path) as { name: string } | undefined
  if (already) {
    throw createError({
      statusCode: 409,
      statusMessage: `Ce dossier est déjà géré sous le nom « ${already.name} ».`,
    })
  }

  const taken = (await portOwners()).get(input.hostPort)
  if (taken) {
    throw createError({
      statusCode: 409,
      statusMessage: `Le port ${input.hostPort} est déjà utilisé par « ${taken.name} », en marche.`,
      data: { conflictId: taken.id, conflictName: taken.name, port: input.hostPort },
    })
  }

  assertMemoryAvailable('minecraft', input.memoryMb)

  const rconPassword = randomBytes(24).toString('base64url')


  useDb()
    .prepare(
      `INSERT INTO servers
         (id, game, name, type, mc_version, host_port, memory_mb, rcon_password,
          data_dir, created_at, loader, loader_version, options)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      id,
      'minecraft',
      input.name,
      detected.type,
      detected.mcVersion,
      input.hostPort,
      input.memoryMb,
      rconPassword,
      detected.path,
      Date.now(),
      detected.loader,
      detected.loaderVersion,
      '{}',
    )

  // Le conteneur est monté sur le dossier existant : rien n'est déplacé.
  await createServerContainer(requireServerRow(id))

  // On ne démarre pas : l'utilisateur vérifie d'abord que la détection est
  // juste, puis lance lui-même. Un import ne doit surprendre personne.
  return { server: await toMinecraftServer(requireServerRow(id)) }
})
