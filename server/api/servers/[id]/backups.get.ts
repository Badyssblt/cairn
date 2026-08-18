export default defineEventHandler(async (event) => {
  const row = requireServerRow(getRouterParam(event, 'id')!)
  const backups = listBackups(row.id)

  return {
    backups: backups.map((b) => ({
      id: b.id,
      name: b.name,
      sizeBytes: b.size_bytes,
      state: b.state,
      // `error` porte aussi les avertissements d'une sauvegarde réussie mais
      // prise à chaud : l'interface les distingue par `state`.
      note: b.error,
      createdAt: b.created_at,
      scope: b.scope,
    })),
  }
})
