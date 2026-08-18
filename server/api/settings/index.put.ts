import { z } from 'zod'

const Body = z.object({
  publicHost: z.string().trim().max(200).optional(),
  discordWebhook: z.string().trim().max(400).optional(),
  hostRamTotalMb: z.number().int().min(1024).max(1024 * 1024).optional(),
  hostRamReserveMb: z.number().int().min(0).max(64 * 1024).optional(),
  factorioUsername: z.string().trim().max(120).optional(),
  factorioToken: z.string().trim().max(200).optional(),
})

export default defineEventHandler(async (event) => {
  const parsed = Body.safeParse(await readBody(event))
  if (!parsed.success) {
    throw createError({ statusCode: 400, statusMessage: 'Réglages invalides.' })
  }
  const b = parsed.data

  if (b.publicHost !== undefined) setSetting('public_host', b.publicHost)
  if (b.discordWebhook !== undefined) {
    const url = b.discordWebhook
    // Une chaîne vide efface ; sinon on vérifie que c'est bien un webhook.
    if (url && !/^https:\/\/(discord\.com|discordapp\.com)\/api\/webhooks\//.test(url)) {
      throw createError({
        statusCode: 400,
        statusMessage: "Ce n'est pas une adresse de webhook Discord.",
      })
    }
    setSetting('discord_webhook', url)
  }

  if (b.hostRamTotalMb !== undefined) {
    setSetting('host_ram_total', String(b.hostRamTotalMb))
  }
  if (b.hostRamReserveMb !== undefined) {
    setSetting('host_ram_reserve', String(b.hostRamReserveMb))
  }

  // Le portail de mods Factorio n'ouvre ses téléchargements qu'à un compte.
  if (b.factorioUsername !== undefined) setSetting('factorio_username', b.factorioUsername)
  if (b.factorioToken !== undefined) setSetting('factorio_token', b.factorioToken)

  return { ok: true, capacity: hostCapacity() }
})
