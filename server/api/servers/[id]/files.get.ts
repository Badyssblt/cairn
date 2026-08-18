export default defineEventHandler(async (event) => {
  const row = requireServerRow(getRouterParam(event, 'id')!)
  const q = getQuery(event)
  const path = typeof q.path === 'string' ? q.path : ''

  // Un même point d'entrée sert à parcourir et à ouvrir : l'interface n'a pas
  // à deviner d'avance si un chemin est un dossier ou un fichier.
  if (q.read === 'true') {
    return { type: 'file' as const, path, content: await readTextFile(row.data_dir, path) }
  }
  return { type: 'dir' as const, path, entries: await listDirectory(row.data_dir, path) }
})
