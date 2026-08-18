import { createHash } from 'node:crypto'
import { readdir, rm, stat } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import type { ServerRow } from './servers'

/**
 * DATAPACKS ET PACK DE RESSOURCES
 *
 * Deux gestes qui n'ont rien en commun techniquement, mais qui répondent à la
 * même question — « comment j'ajoute ça à mon serveur ? » — et se règlent tous
 * deux au mauvais endroit quand on les fait à la main.
 *
 * Un datapack ne va pas dans le dossier du serveur mais *dans celui du monde*,
 * sous `<level-name>/datapacks`. Le poser à la racine ne produit aucune erreur :
 * il est simplement ignoré, ce qui est la pire des réponses.
 *
 * Un pack de ressources demande son empreinte SHA-1 à côté de son URL. Sans
 * elle, le client retélécharge le pack à chaque connexion et ne détecte jamais
 * qu'il a changé ; avec une empreinte fausse, il le refuse. La calculer à la
 * main suppose de télécharger le fichier et de lancer `sha1sum` dessus — c'est
 * exactement le genre de tâche qu'un panneau doit faire à la place.
 */

export interface DatapackInfo {
  name: string
  sizeMb: number
  /** Un dossier est un datapack déballé, un .zip un datapack livré tel quel. */
  packed: boolean
}

/** Le dossier des datapacks du monde chargé. */
export async function datapacksDir(row: ServerRow): Promise<string> {
  return join(resolve(row.data_dir), await levelName(row), 'datapacks')
}

export async function listDatapacks(row: ServerRow): Promise<DatapackInfo[]> {
  const dir = await datapacksDir(row)

  let names: string[]
  try {
    names = await readdir(dir)
  } catch {
    return [] // Le dossier n'existe qu'une fois le monde généré.
  }

  const out: DatapackInfo[] = []
  for (const name of names) {
    if (name.startsWith('.')) continue
    const s = await stat(join(dir, name)).catch(() => null)
    if (!s) continue

    out.push({
      name,
      sizeMb: Math.round((s.size / 1024 / 1024) * 10) / 10,
      packed: s.isFile(),
    })
  }

  return out.sort((a, b) => a.name.localeCompare(b.name, 'fr'))
}

export async function removeDatapack(row: ServerRow, name: string): Promise<void> {
  const safe = name.replace(/[/\\]/g, '')
  if (!safe || safe.startsWith('.')) {
    throw createError({ statusCode: 400, statusMessage: 'Nom de datapack invalide.' })
  }

  const path = join(await datapacksDir(row), safe)
  const exists = await stat(path).catch(() => null)
  if (!exists) {
    throw createError({ statusCode: 404, statusMessage: `« ${safe} » n'existe pas.` })
  }

  await rm(path, { recursive: true, force: true })
}

/**
 * Recharge les datapacks sans redémarrer.
 *
 * `/reload` relit les datapacks à chaud — c'est le seul cas où un ajout prend
 * effet sans arrêter le serveur. Renvoie false quand il n'a pas pu être fait,
 * pour que l'interface dise « redémarre » plutôt que de laisser croire que
 * c'est en place.
 */
export async function reloadDatapacks(row: ServerRow): Promise<boolean> {
  const rcon = await serverRcon(row).catch(() => null)
  if (!rcon) return false

  try {
    // `reload` sans argument : c'est la commande vanilla qui relit les
    // datapacks. Le `confirm` que l'on voit parfois appartient au `/reload` de
    // Bukkit, qui recharge les plugins et n'a rien à voir.
    await rcon.command('reload')
    return true
  } catch {
    return false
  }
}

/* -- Pack de ressources ---------------------------------------------------- */

/** Au-delà, le client refuse le téléchargement de toute façon. */
const MAX_PACK_BYTES = 250 * 1024 * 1024

export interface ResourcePackResult {
  url: string
  sha1: string
  sizeMb: number
}

/**
 * Télécharge le pack pour en calculer l'empreinte, sans le garder.
 *
 * On ne conserve pas le fichier : c'est le client de chaque joueur qui le
 * téléchargera depuis l'URL. Le serveur n'a besoin que de son empreinte, donc
 * on le lit en flux et on jette les octets au fur et à mesure.
 */
export async function fetchResourcePackHash(url: string): Promise<ResourcePackResult> {
  let res: Response
  try {
    res = await fetch(url, { redirect: 'follow' })
  } catch {
    throw createError({
      statusCode: 400,
      statusMessage: "L'URL n'a pas répondu. Vérifie qu'elle est publique et accessible.",
    })
  }

  if (!res.ok || !res.body) {
    throw createError({
      statusCode: 400,
      statusMessage: `L'URL a répondu ${res.status}. Elle doit pointer directement sur le fichier .zip, pas sur une page de téléchargement.`,
    })
  }

  const hash = createHash('sha1')
  let size = 0

  for await (const chunk of res.body as any as AsyncIterable<Uint8Array>) {
    size += chunk.length
    if (size > MAX_PACK_BYTES) {
      throw createError({
        statusCode: 413,
        statusMessage: 'Le pack dépasse 250 Mo : les clients le refuseront.',
      })
    }
    hash.update(chunk)
  }

  if (!size) {
    throw createError({ statusCode: 400, statusMessage: 'Le fichier téléchargé est vide.' })
  }

  return {
    url,
    sha1: hash.digest('hex'),
    sizeMb: Math.round((size / 1024 / 1024) * 10) / 10,
  }
}
