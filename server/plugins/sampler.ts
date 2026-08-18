import type { Sample } from '#shared/types'

/**
 * ÉCHANTILLONNEUR — un seul, pour tous les serveurs et tous les clients.
 *
 * C'est la réponse à la question du coût : plutôt que chaque composant affiché
 * interroge Docker de son côté, un unique relevé toutes les 30 s alimente à la
 * fois le rack, les chiffres instantanés et le tick ribbon. Le nombre de
 * clients connectés ne change donc rien à la charge.
 */
const INTERVAL_MS = 30_000

/** Purge horaire : la rétention est de 24 h, inutile d'y toucher plus souvent. */
const PURGE_EVERY = Math.round((60 * 60 * 1000) / INTERVAL_MS)

export default defineNitroPlugin((nitro) => {
  let ticks = 0
  let running = false

  async function sampleOne(row: ReturnType<typeof listServerRows>[number]) {
    const status = await containerStatus(row.id)

    // Prévenir sur Discord quand l'état bascule, pas à chaque relevé.
    await announceStateChange(row.id, row.name, status.state, status.crashLooping)

    if (!status.exists || status.state !== 'running') {
      return {
        ts: Date.now(),
        state: status.exists ? status.state : 'stopped',
        tps: null,
        mspt: null,
        players: null,
        maxPlayers: null,
        ramUsedMb: null,
        cpuPercent: null,
      } satisfies Sample
    }

    const stats = await containerStats(row.id)
    const rcon = await serverRcon(row)

    // RCON échoue tant que le monde charge : c'est normal, on enregistre
    // l'échantillon quand même avec ce qu'on a.
    const [players, tps, mspt] = rcon
      ? await Promise.all([rcon.players(), rcon.tps(), rcon.mspt()])
      : [null, null, null]

    return {
      ts: Date.now(),
      state: 'running',
      tps,
      mspt,
      players: players?.online ?? null,
      maxPlayers: players?.max ?? null,
      ramUsedMb: stats.ramUsedMb,
      cpuPercent: stats.cpuPercent,
    } satisfies Sample
  }

  async function tick() {
    // Si un relevé déborde l'intervalle, on saute plutôt que d'empiler.
    if (running) return
    running = true
    try {
      const rows = listServerRows()
      for (const row of rows) {
        try {
          insertSample(row.id, await sampleOne(row))
          // Se recalcule seulement si la mesure a vieilli (voir disk.ts).
          await refreshDiskUsage(row)
        } catch (e) {
          console.error(`[sampler] ${row.id}:`, (e as Error).message)
        }
      }
      if (++ticks % PURGE_EVERY === 0) purgeOldSamples()

      // Les tâches planifiées se réveillent au même rythme : une granularité
      // de 30 s suffit largement pour un redémarrage nocturne.
      await runDueSchedules()
    } finally {
      running = false
    }
  }

  const timer = setInterval(tick, INTERVAL_MS)
  // Le relevé ne doit pas retenir le process au moment de l'arrêt.
  timer.unref?.()
  console.log(`[sampler] démarré, relevé toutes les ${INTERVAL_MS / 1000} s`)

  // Un arrêt du panneau pendant un téléchargement laisse une installation en
  // plan : on la reprend là où elle s'est arrêtée plutôt que de la perdre.
  resumeInterruptedInstalls()

  // On mémorise l'état de départ sans rien annoncer : sinon le panneau
  // signalerait à son démarrage tout ce qui s'est passé en son absence.
  Promise.all(
    listServerRows().map(async (r) => ({
      id: r.id,
      state: (await containerStatus(r.id)).state,
    })),
  )
    .then(primeStates)
    .catch(() => {})
  tick().catch((e) => console.error('[sampler] premier relevé:', e))

  nitro.hooks.hook('close', () => {
    clearInterval(timer)
    closeAllRcon()
  })
})
