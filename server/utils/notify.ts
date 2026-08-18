/**
 * DÉTECTION DES CHANGEMENTS D'ÉTAT
 *
 * Un serveur qui tombe à trois heures du matin est invisible : le panneau
 * l'affiche, encore faut-il le regarder. `recordEvent` (voir events.ts) est
 * le point d'entrée qui garde une trace et prévient sur Discord — ici, on ne
 * décide que du *quand* : on n'annonce que ce qui mérite une interruption
 * (une panne, une boucle de redémarrage, une sauvegarde ratée). Un serveur
 * qu'on démarre soi-même n'a pas besoin d'être annoncé, et une alerte qui
 * parle trop finit ignorée.
 */

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
      await recordEvent(
        'bad',
        `${name} redémarre en boucle`,
        "Le serveur s'arrête aussitôt lancé. Ouvre le panneau : le diagnostic dit pourquoi.",
        serverId,
      )
    }
    return
  }
  announcedLoop.delete(serverId)

  if (!previous || previous === state) return

  // Passer de « en marche » à « arrêté » sans qu'on l'ait demandé est le seul
  // changement qui mérite de réveiller quelqu'un.
  if (previous === 'running' && state === 'error') {
    await recordEvent('bad', `${name} s'est arrêté`, 'Le serveur ne tourne plus.', serverId)
  } else if (previous === 'error' && state === 'running') {
    await recordEvent('good', `${name} est reparti`, 'Le serveur a redémarré normalement.', serverId)
  }
}

/** Le panneau vient de démarrer : on ne réveille personne pour l'existant. */
export function primeStates(entries: { id: string; state: string }[]) {
  for (const e of entries) lastState.set(e.id, e.state)
}
