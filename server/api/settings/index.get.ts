import { hostname, totalmem } from 'node:os'

export default defineEventHandler(() => {
  return {
    // Sert à montrer l'adresse de connexion telle que les joueurs la saisiront.
    host: hostname(),
    publicHost: getSetting('public_host') ?? '',
    discordWebhook: Boolean(getSetting('discord_webhook')),
    factorioUsername: getSetting('factorio_username') ?? '',
    // Le jeton ne ressort jamais : on ne dit que s'il est renseigné.
    factorioToken: Boolean(getSetting('factorio_token')),
    dataRoot: useRuntimeConfig().dataRoot,
    hostRamTotalMb:
      Number(getSetting('host_ram_total')) || Math.round(totalmem() / 1024 / 1024),
    hostRamReserveMb: Number(getSetting('host_ram_reserve')) || 2048,
    capacity: hostCapacity(),
  }
})
