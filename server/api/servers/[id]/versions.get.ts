/**
 * Versions disponibles pour le modpack de ce serveur, la plus récente d'abord,
 * avec un repère sur celle qui est installée.
 */
export default defineEventHandler(async (event) => {
  const row = requireServerRow(getRouterParam(event, 'id')!)

  if (row.type !== 'MODPACK' || !row.modpack_project) {
    return { updatable: false as const, current: row.mc_version, versions: [] }
  }

  const current = row.modpack_version ?? ''

  if (row.modpack_source === 'CURSEFORGE') {
    const versions = await cfPackVersions(Number(row.modpack_project))
    return {
      updatable: true as const,
      source: 'CURSEFORGE' as const,
      current,
      versions: versions.map((v) => ({
        id: String(v.id),
        label: v.name,
        meta:
          (v.type !== 'release' ? `${v.type} · ` : '') +
          new Date(v.updated).toLocaleDateString('fr-FR'),
        installed: String(v.id) === current,
      })),
    }
  }

  const versions = await modpackVersions(row.modpack_project)
  return {
    updatable: true as const,
    source: 'MODRINTH' as const,
    current,
    versions: versions.map((v) => ({
      id: v.id,
      label: v.versionNumber,
      meta: `Minecraft ${v.gameVersions.join(', ') || '—'}`,
      installed: v.id === current,
    })),
  }
})
