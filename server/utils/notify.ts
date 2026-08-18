/**
 * ALERTES DISCORD
 *
 * Un serveur qui tombe à trois heures du matin est invisible : le panneau
 * l'affiche, encore faut-il le regarder. Discord est le bon canal pour un
 * serveur entre amis — c'est le salon où vous êtes déjà.
 *
 * On n'annonce que ce qui mérite une interruption : une panne, une boucle de
 * redémarrage, une sauvegarde ratée. Un serveur qu'on démarre soi-même n'a pas
 * besoin d'être annoncé, et une alerte qui parle trop finit ignorée.
 */

export type NotifyLevel = 'bad' | 'warn' | 'good'

const COLORS: Record<NotifyLevel, number> = {
  bad: 0xd2504a,
  warn: 0xe8913a,
  good: 0x5fae6e,
}

export async function notify(
  level: NotifyLevel,
  title: string,
  detail: string,
): Promise<void> {
  const url = getSetting('discord_webhook')?.trim()
  if (!url) return

  try {
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: 'Cairn',
        embeds: [
          {
            title,
            description: detail,
            color: COLORS[level],
            timestamp: new Date().toISOString(),
          },
        ],
      }),
      signal: AbortSignal.timeout(8000),
    })
  } catch {
    // Une alerte qui échoue ne doit jamais faire tomber ce qu'elle annonçait.
  }
}

/* -- Détection des changements d'état ------------------------------------ */

/**
 * Dernier état connu de chaque serveur.
 *
 * En mémoire seulement : au redémarrage du panneau on repart d'une page
 * blanche, ce qui évite d'annoncer d'un coup tout ce qui s'est passé pendant
 * qu'il était arrêté.
 */
const lastState = new Map<string, string>()
const announcedLoop = new Set<string>()

export async function announceStateChange(
  serverId: string,
  name: string,
  state: string,
  crashLooping: boolean,
) {
  const previous = lastState.get(serverId)
  lastState.set(serverId, state)

  // Une boucle de redémarrage ne s'annonce qu'une fois : elle produirait
  // sinon une alerte toutes les trente secondes.
  if (crashLooping) {
    if (!announcedLoop.has(serverId)) {
      announcedLoop.add(serverId)
      await notify(
        'bad',
        `${name} redémarre en boucle`,
        "Le serveur s'arrête aussitôt lancé. Ouvre le panneau : le diagnostic dit pourquoi.",
      )
    }
    return
  }
  announcedLoop.delete(serverId)

  if (!previous || previous === state) return

  // Passer de « en marche » à « arrêté » sans qu'on l'ait demandé est le seul
  // changement qui mérite de réveiller quelqu'un.
  if (previous === 'running' && state === 'error') {
    await notify('bad', `${name} s'est arrêté`, 'Le serveur ne tourne plus.')
  } else if (previous === 'error' && state === 'running') {
    await notify('good', `${name} est reparti`, 'Le serveur a redémarré normalement.')
  }
}

/** Le panneau vient de démarrer : on ne réveille personne pour l'existant. */
export function primeStates(entries: { id: string; state: string }[]) {
  for (const e of entries) lastState.set(e.id, e.state)
}
