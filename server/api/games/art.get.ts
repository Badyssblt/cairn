/**
 * Visuels pour une poignée de jeux, demandés par leur nom.
 *
 * L'interface n'en réclame que pour ce qu'elle affiche : résoudre les 140 jeux
 * d'un coup ferait 140 requêtes chez Steam pour douze vignettes visibles.
 */
export default defineEventHandler(async (event) => {
  const raw = getQuery(event).names
  const names = (typeof raw === 'string' ? raw : '')
    .split('|')
    .map((n) => n.trim())
    .filter(Boolean)
    .slice(0, 20)

  if (!names.length) return { art: {} }

  const resolved = await gameArtMany(names)
  return { art: Object.fromEntries(resolved) }
})
