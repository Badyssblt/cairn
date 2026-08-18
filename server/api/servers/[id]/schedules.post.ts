import { z } from 'zod'

const Body = z.object({
  name: z.string().trim().min(1).max(60),
  action: z.enum(['backup', 'restart', 'stop', 'start', 'command']),
  payload: z.string().trim().max(200).optional().nullable(),
  frequency: z.enum(['daily', 'weekly', 'interval']),
  atHour: z.number().int().min(0).max(23).default(4),
  atMinute: z.number().int().min(0).max(59).default(0),
  weekday: z.number().int().min(0).max(6).optional().nullable(),
  everyHours: z.number().int().min(1).max(168).optional().nullable(),
  enabled: z.boolean().default(true),
  // Au-delà d'une demi-heure, l'annonce est oubliée avant d'avoir servi.
  warnMinutes: z.number().int().min(0).max(30).default(0),
  skipIfPlayers: z.boolean().default(false),
})

export default defineEventHandler(async (event) => {
  const row = requireServerRow(getRouterParam(event, 'id')!)

  const parsed = Body.safeParse(await readBody(event))
  if (!parsed.success) {
    throw createError({
      statusCode: 400,
      statusMessage: parsed.error.issues[0]?.message ?? 'Tâche invalide.',
    })
  }
  const input = parsed.data

  // Une commande sans commande ne ferait rien : autant le dire ici.
  if (input.action === 'command' && !input.payload?.trim()) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Indique la commande à envoyer.',
    })
  }

  // Refuser plutôt que d'accepter en silence un réglage sans effet : l'annonce
  // passe par la console du jeu, et tous les jeux n'en ont pas.
  if (input.warnMinutes > 0 && !gameAdapter(row.game).rcon?.broadcast) {
    throw createError({
      statusCode: 400,
      statusMessage: `${gameAdapter(row.game).name} ne sait pas afficher de message à ses joueurs : la coupure ne peut pas être annoncée.`,
    })
  }

  return { id: createSchedule(row.id, input) }
})
