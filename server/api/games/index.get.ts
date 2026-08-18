/**
 * Catalogue des jeux, tel que l'interface en a besoin : de quoi dessiner le
 * choix et le formulaire, sans exposer les détails d'exécution (image,
 * variables, ports) qui ne regardent que le serveur.
 */
export default defineEventHandler(() => ({
  games: gameAdapters().map((a) => ({
    id: a.id,
    name: a.name,
    tagline: a.tagline,
    defaultPort: a.defaultPort,
    defaultMemoryGb: a.defaultMemoryGb,
    fields: a.fields ?? [],
    hasConsole: Boolean(a.rcon),
    contentSources: a.contentSources ?? [],
    versionSelectable: Boolean(a.versionSelectable),
    // null = pas de visuel Steam pour ce jeu.
    steamName: a.steamName === null ? null : (a.steamName ?? a.name),
  })),
}))
