/** Envoie un message d'essai, pour vérifier le webhook avant d'en dépendre. */
export default defineEventHandler(async () => {
  if (!getSetting('discord_webhook')?.trim()) {
    throw createError({
      statusCode: 400,
      statusMessage: "Aucun webhook Discord n'est enregistré.",
    })
  }
  await notify('good', 'Cairn est branché', 'Les alertes de tes serveurs arriveront ici.')
  return { ok: true }
})
