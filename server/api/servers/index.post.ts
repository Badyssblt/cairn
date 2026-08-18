import { randomBytes } from 'node:crypto'
import { mkdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { z } from 'zod'

const Body = z.object({
  game: z.string().trim().min(1).default('minecraft'),
  name: z.string().trim().min(2).max(40),
  memoryMb: z.number().int().min(512).max(64 * 1024),
  hostPort: z.number().int().min(1024).max(65535),
  /** Réglages propres au jeu, déclarés par son adaptateur. */
  options: z.record(z.string(), z.string()).default({}),
  cpuLimit: z.number().min(0.1).max(64).optional().nullable(),
  diskLimitMb: z.number().int().min(256).optional().nullable(),

  /* -- Minecraft uniquement ---------------------------------------------- */
  type: z.enum(['VANILLA', 'PAPER', 'FORGE', 'FABRIC', 'MODPACK']).optional(),
  mcVersion: z.string().trim().max(20).default('LATEST'),
  /** MODRINTH (slug + version) ou CURSEFORGE (identifiants numériques). */
  modpackSource: z.enum(['MODRINTH', 'CURSEFORGE']).optional().nullable(),
  modpackProject: z.string().trim().optional().nullable(),
  modpackVersion: z.string().trim().optional().nullable(),
  modpackLoader: z.string().trim().optional().nullable(),
  modpackName: z.string().trim().optional().nullable(),
  modpackIcon: z.string().trim().url().optional().nullable(),
})

export default defineEventHandler(async (event) => {
  const parsed = Body.safeParse(await readBody(event))
  if (!parsed.success) {
    throw createError({
      statusCode: 400,
      statusMessage: parsed.error.issues[0]?.message ?? 'Formulaire incomplet.',
    })
  }
  const input = parsed.data
  const adapter = gameAdapter(input.game)
  const isMinecraft = adapter.id === 'minecraft'

  if (isMinecraft && !input.type) {
    throw createError({ statusCode: 400, statusMessage: 'Choisis un type de serveur.' })
  }

  // Les réglages obligatoires du jeu sont vérifiés ici : les laisser passer
  // produirait un conteneur qui échoue au démarrage sans dire pourquoi.
  for (const field of adapter.fields ?? []) {
    if (field.required && !input.options[field.key]?.trim()) {
      throw createError({
        statusCode: 400,
        statusMessage: `« ${field.label} » est obligatoire pour ${adapter.name}.`,
      })
    }
  }

  if (input.type === 'MODPACK' && !input.modpackProject) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Choisis un modpack avant de créer le serveur.',
    })
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
      statusMessage: `Un serveur porte déjà le nom « ${input.name} ». Choisis-en un autre.`,
    })
  }

  const rconPassword = randomBytes(24).toString('base64url')

  // Un jeu peut réclamer plusieurs ports consécutifs (Valheim en prend trois) :
  // on les vérifie tous, sinon la collision n'apparaîtrait qu'au démarrage.
  const draft = {
    id, game: adapter.id, name: input.name, type: input.type ?? 'VANILLA',
    mc_version: input.mcVersion, host_port: input.hostPort,
    memory_mb: input.memoryMb, rcon_password: rconPassword,
  } as any
  // L'adaptateur est éprouvé sur le brouillon AVANT toute écriture : une
  // image invalide ou des ports illisibles doivent échouer ici, pas après
  // avoir laissé une ligne en base et un dossier sur le disque.
  const draftCtx = { row: draft, options: input.options }
  try {
    adapter.image(draftCtx)
    adapter.ports(draftCtx)
  } catch (e: any) {
    throw createError({
      statusCode: 400,
      statusMessage: e?.message ?? `Réglages invalides pour ${adapter.name}.`,
    })
  }

  const owners = portOwners()
  for (const port of occupiedHostPorts(adapter, draftCtx, input.hostPort)) {
    const taken = owners.get(port)
    if (taken) {
      throw createError({
        statusCode: 409,
        statusMessage:
          port === input.hostPort
            ? `Le port ${port} est déjà pris par « ${taken} ». Choisis un autre port.`
            : `${adapter.name} a aussi besoin du port ${port}, déjà pris par « ${taken} ».`,
      })
    }
  }

  // Refuse avant de créer quoi que ce soit : pas de dossier ni de conteneur
  // orphelin si la capacité manque.
  assertMemoryAvailable(adapter.id, input.memoryMb)

  const dataDir = join(resolve(useRuntimeConfig().dataRoot), id)
  const isCurseforge =
    isMinecraft && input.type === 'MODPACK' && input.modpackSource === 'CURSEFORGE'

  mkdirSync(dataDir, { recursive: true })

  useDb()
    .prepare(
      `INSERT INTO servers
         (id, game, name, type, mc_version, modpack_name, modpack_source,
          modpack_project, modpack_version, modpack_loader,
          host_port, memory_mb, rcon_password, data_dir, created_at,
          install_state, install_step, install_progress, icon_url, options,
          cpu_limit, disk_limit_mb)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      id,
      adapter.id,
      input.name,
      input.type ?? 'VANILLA',
      input.mcVersion,
      input.modpackName ?? null,
      input.type === 'MODPACK' ? (input.modpackSource ?? 'MODRINTH') : null,
      input.modpackProject ?? null,
      input.modpackVersion ?? null,
      input.modpackLoader ?? null,
      input.hostPort,
      input.memoryMb,
      rconPassword,
      dataDir,
      Date.now(),
      isCurseforge ? 'installing' : null,
      isCurseforge ? 'En attente' : null,
      isCurseforge ? 0 : null,
      input.modpackIcon ?? null,
      JSON.stringify(input.options),
      input.cpuLimit ?? null,
      input.diskLimitMb ?? null,
    )

  const row = requireServerRow(id)

  if (isCurseforge) {
    // Le modpack se télécharge mod par mod : on rend la main tout de suite,
    // l'avancement se suit via l'état du serveur.
    startInstall(row, input.hostPort, input.memoryMb)
  } else {
    try {
      await createServerContainer(row)
      await startContainer(id)
    } catch (e: any) {
      // Un échec ne doit pas laisser de serveur fantôme dans le rack : on
      // défait ce qui a été écrit avant de remonter l'erreur.
      await removeContainer(id).catch(() => {})
      useDb().prepare('DELETE FROM servers WHERE id = ?').run(id)
      throw createError({
        statusCode: 502,
        statusMessage: `Le serveur n'a pas pu démarrer : ${e?.message ?? 'erreur Docker'}`,
      })
    }
  }

  return { server: await toMinecraftServer(row) }
})
