import { z } from 'zod'
import { unzipSync } from 'fflate'
import { readFile, mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve, sep } from 'node:path'
import { extract as tarExtract } from 'tar'

const Body = z.object({ path: z.string().min(1) })

/**
 * Décompresse une archive déposée sur le serveur, à côté d'elle.
 *
 * C'est ce qui rend l'envoi de fichiers réellement utile : on téléverse un
 * monde ou un pack de configuration en une archive, au lieu de centaines de
 * fichiers un par un.
 */
export default defineEventHandler(async (event) => {
  const row = requireServerRow(getRouterParam(event, 'id')!)

  const parsed = Body.safeParse(await readBody(event))
  if (!parsed.success) {
    throw createError({ statusCode: 400, statusMessage: 'Aucune archive indiquée.' })
  }

  const archive = safeJoin(row.data_dir, parsed.data.path)
  const target = dirname(archive)
  const lower = archive.toLowerCase()

  if (lower.endsWith('.tar.gz') || lower.endsWith('.tgz') || lower.endsWith('.tar')) {
    await tarExtract({ file: archive, cwd: target })
    return { ok: true }
  }

  if (!lower.endsWith('.zip')) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Formats acceptés : .zip, .tar, .tar.gz.',
    })
  }

  const entries = unzipSync(new Uint8Array(await readFile(archive)))
  const root = resolve(row.data_dir)

  for (const [name, content] of Object.entries(entries)) {
    if (name.endsWith('/') || content.length === 0) continue

    // Une archive piégée pourrait viser hors du dossier du serveur.
    const out = resolve(target, name)
    if (out !== root && !out.startsWith(root + sep)) continue

    await mkdir(dirname(out), { recursive: true })
    await writeFile(out, content)
  }
  return { ok: true }
})
