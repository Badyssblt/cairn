export default defineEventHandler(async (event) => {
  const row = requireServerRow(getRouterParam(event, 'id')!)

  return {
    /**
     * Le jeu sait-il afficher un message à ses joueurs ? Sans ça, proposer
     * « prévenir 5 minutes avant » promettrait une annonce qui n'aurait
     * jamais lieu — mieux vaut ne pas offrir le réglage du tout.
     */
    canAnnounce: Boolean(gameAdapter(row.game).rcon?.broadcast),

    schedules: listSchedules(row.id).map((s) => ({
      id: s.id,
      name: s.name,
      action: s.action,
      payload: s.payload,
      frequency: s.frequency,
      atHour: s.at_hour,
      atMinute: s.at_minute,
      weekday: s.weekday,
      everyHours: s.every_hours,
      enabled: Boolean(s.enabled),
      lastRunAt: s.last_run_at,
      lastStatus: s.last_status,
      nextRunAt: s.next_run_at,
      warnMinutes: s.warn_minutes,
      skipIfPlayers: Boolean(s.skip_if_players),
      deferCount: s.defer_count,
    })),
  }
})
