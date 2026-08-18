import { totalmem } from 'node:os'

/** Réserve laissée au système. L'hôte fait tourner autre chose que des JVM. */
const DEFAULT_RESERVE_MB = 2048

export interface HostCapacity {
  totalMb: number
  reserveMb: number
  usableMb: number
  allocatedMb: number
  freeMb: number
}

/**
 * Mémoire réellement réservée par les conteneurs.
 *
 * Ce n'est pas `SUM(memory_mb)` : cette colonne porte le tas Java, alors que
 * Docker se voit imposer `containerMemoryMb()`, c'est-à-dire le tas plus une
 * marge hors-tas. Compter les tas laissait créer un serveur qui ne rentrait
 * pas, et la sanction tombait plus tard sous forme d'arrêt par le noyau — que
 * le panneau diagnostiquait ensuite comme un manque de mémoire, sans dire que
 * c'était lui qui avait accepté l'allocation.
 */
function allocatedMemoryMb(exceptId?: string): number {
  let total = 0
  for (const row of listServerRows()) {
    if (row.id === exceptId) continue
    total += containerMemoryMb(row.game, row.memory_mb)
  }
  return total
}

export function hostCapacity(): HostCapacity {
  // La valeur réglée l'emporte : en conteneur, totalmem() voit la RAM de
  // l'hôte entier, ce qui n'est pas forcément ce qu'on veut allouer.
  const totalMb =
    Number(getSetting('host_ram_total')) || Math.round(totalmem() / 1024 / 1024)
  const reserveMb = Number(getSetting('host_ram_reserve')) || DEFAULT_RESERVE_MB

  const allocatedMb = allocatedMemoryMb()
  const usableMb = Math.max(0, totalMb - reserveMb)

  return {
    totalMb,
    reserveMb,
    usableMb,
    allocatedMb,
    freeMb: usableMb - allocatedMb,
  }
}

/**
 * Refuse une allocation qui dépasserait la capacité, en disant de combien.
 * Un message qui se contente de « pas assez de mémoire » oblige à aller
 * calculer soi-même : celui-ci donne le chiffre qui manque.
 *
 * Le jeu compte : seul Minecraft réclame une marge au-dessus du tas demandé,
 * et l'ignorer sous-estimerait la réservation d'un bon gigaoctet par serveur.
 */
export function assertMemoryAvailable(
  gameId: string,
  requestedMb: number,
  exceptId?: string,
) {
  const cap = hostCapacity()
  const already = allocatedMemoryMb(exceptId)
  const requested = containerMemoryMb(gameId, requestedMb)

  const after = already + requested
  if (after > cap.usableMb) {
    const missing = after - cap.usableMb
    const overhead = requested - requestedMb

    throw createError({
      statusCode: 409,
      statusMessage:
        `Il manque ${gb(missing)} Go. L'hôte offre ${gb(cap.usableMb)} Go allouables ` +
        `(${gb(cap.totalMb)} Go moins ${gb(cap.reserveMb)} Go réservés au système) ` +
        `et ${gb(already)} Go sont déjà pris.` +
        // Sans cette phrase, l'écart entre la valeur saisie et celle du message
        // paraît être une erreur de calcul du panneau.
        (overhead > 0
          ? ` Ce serveur en demande ${gb(requested)} : ${gb(requestedMb)} Go de tas Java` +
            ` plus ${gb(overhead)} Go que la JVM consomme hors-tas.`
          : ''),
    })
  }
}

const gb = (mb: number) => (mb / 1024).toFixed(1).replace('.', ',')
