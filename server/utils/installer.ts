import { createWriteStream } from 'node:fs'
import { mkdir, readFile, rename, stat, unlink, writeFile } from 'node:fs/promises'
import { dirname, join, resolve, sep } from 'node:path'
import { unzipSync } from 'fflate'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import type { ServerRow } from './servers'

/**
 * INSTALLATION D'UN MODPACK CURSEFORGE
 *
 * On télécharge les mods nous-mêmes, puis on laisse itzg poser le modloader —
 * la partie réellement délicate. L'installeur officiel de FTB aurait pu s'en
 * charger, mais son chemin CurseForge est cassé en amont (voir curseforge.ts).
 *
 * L'opération dure plusieurs minutes : elle tourne donc en arrière-plan, et
 * son avancement vit en base pour survivre à un redémarrage du panneau.
 */

/** Assez pour saturer une bonne liaison sans se faire limiter par le CDN. */
const CONCURRENCY = 6

/** Installations en cours dans ce process, pour ne pas en lancer deux. */
const running = new Set<string>()

function setProgress(id: string, step: string, progress: number) {
  useDb()
    .prepare('UPDATE servers SET install_step = ?, install_progress = ? WHERE id = ?')
    .run(step, Math.round(progress), id)
}

function finishInstall(id: string, error: string | null) {
  useDb()
    .prepare(
      `UPDATE servers
          SET install_state = ?, install_error = ?, install_step = NULL,
              install_progress = NULL
        WHERE id = ?`,
    )
    .run(error ? 'failed' : null, error, id)
}

/**
 * Lance l'installation en arrière-plan. Retourne immédiatement : l'appelant
 * répond à l'utilisateur sans attendre la fin du téléchargement.
 */
export function startInstall(row: ServerRow, hostPort: number, memoryMb: number) {
  if (running.has(row.id)) return
  running.add(row.id)

  install(row, hostPort, memoryMb)
    .then(() => finishInstall(row.id, null))
    .catch((e: any) => {
      console.error(`[installer] ${row.id}:`, e)
      finishInstall(row.id, e?.message ?? "L'installation a échoué.")
    })
    .finally(() => running.delete(row.id))
}

async function install(row: ServerRow, hostPort: number, memoryMb: number) {
  const packId = Number(row.modpack_project)
  const versionId = Number(row.modpack_version)

  setProgress(row.id, 'Lecture du modpack', 0)
  const plan = await installPlan(packId, versionId)

  const dataDir = resolve(row.data_dir)

  // Mise à jour : on retire d'abord ce que la version précédente avait posé.
  // Deux versions du même mod côte à côte empêchent le serveur de démarrer.
  const previousVersion = await previousInstalledVersion(dataDir, row, versionId)
  if (previousVersion) {
    setProgress(row.id, 'Retrait de la version précédente', 2)
    await removeManifestFiles(dataDir, previousVersion)
  }

  if (!plan.files.length) {
    throw new Error("Ce modpack ne publie aucun fichier installable côté serveur.")
  }
  if (!plan.loader || !plan.mcVersion) {
    throw new Error(
      "Ce modpack ne déclare pas son modloader : impossible d'en déduire le serveur à lancer.",
    )
  }

  await downloadAll(row.id, dataDir, plan.files, plan.totalBytes)

  setProgress(row.id, 'Application de la configuration du pack', 96)
  await applyOverrides(dataDir)

  await writeManifest(dataDir, {
    source: 'CURSEFORGE',
    project: String(packId),
    version: String(versionId),
    installedAt: Date.now(),
    files: plan.files.map((f) => (f.path ? `${f.path}/${f.name}` : f.name)),
  })

  setProgress(row.id, 'Préparation du serveur', 97)

  // Le loader et la version viennent du modpack, pas de l'utilisateur : on les
  // garde en base pour que redémarrer le serveur les retrouve à l'identique.
  useDb()
    .prepare(
      'UPDATE servers SET loader = ?, loader_version = ?, mc_version = ? WHERE id = ?',
    )
    .run(plan.loader, plan.loaderVersion, plan.mcVersion, row.id)

  setProgress(row.id, "Récupération de l'image", 98)

  // Une mise à jour change le loader ou la version de Java : le conteneur
  // existant porte les anciennes valeurs, il faut le refaire.
  await recreateServerContainer(requireServerRow(row.id))

  setProgress(row.id, 'Démarrage', 99)
  await startContainer(row.id)
}

/**
 * Ce que la version précédente avait posé, à retirer avant d'installer.
 *
 * Le manifeste est la source normale. Il peut manquer sur un serveur créé
 * avant son introduction : dans ce cas on le reconstitue en redemandant à
 * CurseForge la liste de fichiers de la version installée. C'est exactement
 * ce qui a été posé à l'époque, sans avoir à deviner ni à vider `mods/` — ce
 * qui effacerait aussi les mods ajoutés à la main.
 */
async function previousInstalledVersion(
  dataDir: string,
  row: ServerRow,
  nextVersionId: number,
) {
  const manifest = await readManifest(dataDir)
  if (manifest) {
    return manifest.version === String(nextVersionId) ? null : manifest
  }

  const installed = Number(row.modpack_version)
  if (!Number.isFinite(installed) || installed === nextVersionId) return null

  try {
    const plan = await installPlan(Number(row.modpack_project), installed)
    return {
      source: 'CURSEFORGE',
      project: String(row.modpack_project),
      version: String(installed),
      installedAt: 0,
      files: plan.files.map((f) => (f.path ? `${f.path}/${f.name}` : f.name)),
    }
  } catch {
    // Version retirée du catalogue : on préfère laisser les anciens fichiers
    // plutôt que d'effacer au jugé. Le démarrage dira ce qui coince.
    return null
  }
}

async function downloadAll(
  serverId: string,
  dataDir: string,
  files: { name: string; path: string; url: string; size: number }[],
  totalBytes: number,
) {
  let done = 0
  let index = 0

  async function worker() {
    while (index < files.length) {
      const file = files[index++]!
      await downloadOne(dataDir, file)
      done += file.size
      // On plafonne à 95 % : les 5 derniers points appartiennent à la mise en
      // place du serveur, qui n'est pas instantanée non plus.
      setProgress(
        serverId,
        `Téléchargement des mods (${index}/${files.length})`,
        totalBytes ? Math.min(95, (done / totalBytes) * 95) : 0,
      )
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, files.length) }, worker),
  )
}

async function downloadOne(
  dataDir: string,
  file: { name: string; path: string; url: string; size: number },
) {
  const dir = join(dataDir, file.path)
  const target = join(dir, file.name)

  // Reprise après interruption : un fichier déjà complet n'est pas retéléchargé.
  try {
    const existing = await stat(target)
    if (file.size > 0 && existing.size === file.size) return
  } catch {
    // absent : on télécharge
  }

  await mkdir(dirname(target), { recursive: true })

  const res = await fetch(file.url, { signal: AbortSignal.timeout(120_000) })
  if (!res.ok || !res.body) {
    throw new Error(`Téléchargement de ${file.name} impossible (HTTP ${res.status}).`)
  }

  // Écriture sous un nom temporaire puis renommage : une interruption ne laisse
  // jamais un .jar tronqué que le serveur essaierait de charger.
  const tmp = `${target}.part`
  try {
    await pipeline(Readable.fromWeb(res.body as any), createWriteStream(tmp))
    await rename(tmp, target)
  } catch (e) {
    await unlink(tmp).catch(() => {})
    throw e
  }
}

/**
 * Déploie `overrides.zip`, que la plupart des modpacks livrent à la racine.
 *
 * Cette archive porte toute la configuration du pack — configs des mods,
 * scripts, listes de recettes. Sans elle, les mods sont bien là mais tournent
 * avec leurs réglages par défaut : ce n'est plus le modpack annoncé.
 *
 * C'est l'export standard CurseForge (`manifest.json` + un dossier
 * `overrides/` qui porte le vrai contenu — voir le champ `overrides` du
 * manifeste, quasi toujours `"overrides"` mais pas garanti). Le dossier
 * n'est qu'un emballage : il faut le retirer en extrayant, sinon les fichiers
 * atterrissent dans `overrides/config/...` au lieu de `config/...`, là où le
 * serveur va réellement les chercher — les quêtes FTB Quests, par exemple, se
 * retrouvent invisibles alors qu'elles sont bien sur le disque.
 */
async function applyOverrides(dataDir: string) {
  const archive = join(dataDir, 'overrides.zip')
  let raw: Buffer
  try {
    raw = await readFile(archive)
  } catch {
    return // la plupart des packs en ont un, mais pas tous
  }

  const entries = unzipSync(new Uint8Array(raw))

  let overridesFolder = 'overrides'
  try {
    const manifest = JSON.parse(
      new TextDecoder().decode(entries['manifest.json']),
    )
    if (typeof manifest.overrides === 'string' && manifest.overrides) {
      overridesFolder = manifest.overrides
    }
  } catch {
    // pas de manifeste CurseForge ou champ absent : on garde le nom par défaut
  }
  const prefix = `${overridesFolder}/`
  // Au cas où une archive ne suivrait pas le schéma CurseForge (pas de
  // dossier overrides/) : mieux vaut tout extraire à plat, comme avant,
  // que de silencieusement ne rien poser du tout.
  const hasOverridesFolder = Object.keys(entries).some((n) => n.startsWith(prefix))

  for (const [name, content] of Object.entries(entries)) {
    if (name.endsWith('/') || content.length === 0) continue

    let relative = name
    if (hasOverridesFolder) {
      if (!name.startsWith(prefix)) continue // manifest.json, modlist.html, etc.
      relative = name.slice(prefix.length)
    }

    // Une archive piégée pourrait viser hors du dossier du serveur : on
    // n'écrit jamais ailleurs que sous dataDir.
    const target = resolve(dataDir, relative)
    if (target !== dataDir && !target.startsWith(dataDir + sep)) continue

    await mkdir(dirname(target), { recursive: true })
    await writeFile(target, content)
  }

  await unlink(archive).catch(() => {})
}

/**
 * Relance les installations laissées en plan par un arrêt du panneau.
 * Les fichiers déjà complets sont conservés, seul le reste est repris.
 */
export function resumeInterruptedInstalls() {
  const rows = useDb()
    .prepare("SELECT * FROM servers WHERE install_state = 'installing'")
    .all() as ServerRow[]

  for (const row of rows) {
    console.log(`[installer] reprise de l'installation de ${row.id}`)
    startInstall(row, row.host_port, row.memory_mb)
  }
}

/**
 * Applique une nouvelle version d'un modpack Modrinth.
 *
 * Ici c'est itzg qui installe : on se contente de recréer le conteneur avec la
 * version demandée. Le dossier de données — donc le monde — est conservé, et
 * l'image nettoie les mods de l'ancienne version au démarrage.
 */
export async function applyModrinthVersion(row: ServerRow) {

  await recreateServerContainer(row)
  await startContainer(row.id)

  useDb()
    .prepare(
      `UPDATE servers SET install_state = NULL, install_step = NULL,
              install_progress = NULL WHERE id = ?`,
    )
    .run(row.id)
}
