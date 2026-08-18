/**
 * Configuration du serveur, dans le format que son jeu déclare.
 *
 * Trois cas, parce que les jeux ne rangent pas leurs réglages pareil :
 * Minecraft a un `server.properties` en clé=valeur ; LinuxGSM répartit les
 * siens entre valeurs livrées et surcharges ; les autres ont des fichiers
 * dont la structure varie trop pour un formulaire, qu'on ouvre en texte.
 */
export default defineEventHandler(async (event) => {
  const row = requireServerRow(getRouterParam(event, 'id')!)
  const adapter = gameAdapter(row.game)
  const ctx = gameContext(row)
  const spec = gameConfigFile(adapter, ctx)

  if (!spec) return { supported: false as const, game: adapter.name }

  if (spec.format === 'properties') {
    const properties = await readProperties(row.data_dir)
    return {
      supported: true as const,
      format: 'properties' as const,
      path: spec.path,
      properties,
      initialized: properties.length > 0,
      /**
       * Ce que font les clés qui comptent. Envoyé avec les valeurs plutôt que
       * figé dans le composant : c'est une connaissance du domaine Minecraft,
       * elle vit avec les adaptateurs de jeu, pas avec l'affichage.
       */
      meta: PROPERTY_META,
      groups: PROPERTY_GROUPS,
    }
  }

  if (spec.format === 'lgsm') {
    const cfg = await readLgsmConfig(row.data_dir, lgsmService(ctx))
    return {
      supported: true as const,
      format: 'lgsm' as const,
      path: cfg.instancePath,
      entries: cfg.entries,
      initialized: cfg.initialized,
    }
  }

  try {
    const content = await readTextFile(row.data_dir, spec.path)
    return {
      supported: true as const,
      format: 'text' as const,
      path: spec.path,
      content,
      initialized: true,
    }
  } catch {
    return {
      supported: true as const,
      format: 'text' as const,
      path: spec.path,
      content: '',
      initialized: false,
    }
  }
})
