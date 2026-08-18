/**
 * L'état du catalogue pour ce serveur : ce qu'il peut recevoir, ce qu'il a
 * déjà, et le résultat de la recherche en cours.
 *
 * Tout en une réponse : la page a besoin des trois ensemble, et un serveur qui
 * n'accepte rien doit pouvoir le dire sans avoir déclenché de recherche.
 */
export default defineEventHandler(async (event) => {
  const row = requireServerRow(getRouterParam(event, 'id')!)
  const { q = '' } = getQuery(event) as { q?: string }

  const target = contentTarget(row)
  if (!target) {
    return { supported: false, reason: whyNoCatalog(row), installed: [], catalog: null }
  }

  const [catalog, installed] = await Promise.all([
    searchContent(row, String(q)).catch((e) => {
      // Le catalogue distant peut être indisponible sans que la liste des
      // extensions déjà en place cesse d'être utile.
      return { error: e.statusMessage ?? 'Catalogue injoignable.' }
    }),
    installedContent(row),
  ])

  return {
    supported: true,
    kind: target.kind === 'mod' ? 'mods' : 'plugins',
    filter: target.label,
    installed,
    catalog: 'error' in catalog ? null : catalog,
    error: 'error' in catalog ? catalog.error : null,
  }
})
