import { z } from 'zod'

/**
 * Actions sur un joueur. Chacune passe par RCON, donc exige un serveur en
 * marche : Minecraft ne relit pas ses listes à chaud.
 */
const ACTIONS = {
  op: (p: string) => `op ${p}`,
  deop: (p: string) => `deop ${p}`,
  kick: (p: string) => `kick ${p}`,
  ban: (p: string) => `ban ${p}`,
  pardon: (p: string) => `pardon ${p}`,
  whitelistAdd: (p: string) => `whitelist add ${p}`,
  whitelistRemove: (p: string) => `whitelist remove ${p}`,
} as const

const Body = z.object({
  action: z.enum(Object.keys(ACTIONS) as [keyof typeof ACTIONS]),
  // Les pseudos Minecraft : lettres, chiffres et tiret bas, 16 au plus.
  player: z.string().trim().regex(/^\w{1,16}$/, 'Pseudo invalide.'),
})

export default defineEventHandler(async (event) => {
  const row = requireServerRow(getRouterParam(event, 'id')!)

  const parsed = Body.safeParse(await readBody(event))
  if (!parsed.success) {
    throw createError({
      statusCode: 400,
      statusMessage: parsed.error.issues[0]?.message ?? 'Requête invalide.',
    })
  }

  const rcon = await serverRcon(row)
  if (!rcon) {
    throw createError({
      statusCode: 409,
      statusMessage: 'Démarre le serveur pour gérer les joueurs.',
    })
  }

  const { action, player } = parsed.data
  return { response: await rcon.command(ACTIONS[action](player)) }
})
