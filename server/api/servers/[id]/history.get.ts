/**
 * Fréquentation sur les dernières heures.
 *
 * Les échantillons existent déjà — un toutes les 30 s — mais le panneau n'en
 * montrait que seize. On les regroupe par tranches pour obtenir une courbe
 * lisible : 2 880 points sur 24 h ne se dessinent pas, et ne se lisent pas.
 */
export default defineEventHandler(async (event) => {
  const row = requireServerRow(getRouterParam(event, 'id')!)
  const hours = Math.min(48, Math.max(1, Number(getQuery(event).hours) || 24))

  const since = Date.now() - hours * 3600_000
  /** Une tranche par tiers d'heure : assez fin pour voir une soirée. */
  const bucketMs = 20 * 60_000

  const rows = useDb()
    .prepare(
      `SELECT (ts / ?) AS bucket,
              MAX(players)  AS peak,
              AVG(players)  AS avg_players,
              AVG(tps)      AS avg_tps,
              MIN(ts)       AS ts
         FROM samples
        WHERE server_id = ? AND ts >= ?
        GROUP BY bucket
        ORDER BY ts ASC`,
    )
    .all(bucketMs, row.id, since) as {
    ts: number
    peak: number | null
    avg_players: number | null
    avg_tps: number | null
  }[]

  const points = rows.map((r) => ({
    ts: r.ts,
    players: r.peak ?? 0,
    tps: r.avg_tps === null ? null : Math.round(r.avg_tps * 10) / 10,
  }))

  const withPlayers = points.filter((p) => p.players > 0)

  return {
    hours,
    points,
    summary: {
      peak: points.reduce((m, p) => Math.max(m, p.players), 0),
      // La moyenne sur les seules tranches fréquentées : inclure les heures
      // vides donnerait un chiffre proche de zéro qui n'apprend rien.
      averageWhenActive: withPlayers.length
        ? Math.round(
            (withPlayers.reduce((s, p) => s + p.players, 0) / withPlayers.length) * 10,
          ) / 10
        : 0,
      activeMinutes: withPlayers.length * 20,
    },
  }
})
