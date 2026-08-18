/**
 * Visuels des jeux.
 *
 * Steam expose une recherche par nom sans clé d'API, qui rend l'identifiant de
 * l'application ; son CDN sert ensuite la jaquette. C'est la même approche que
 * pour les vignettes de modpacks : on affiche l'image officielle plutôt que de
 * dessiner 140 icônes qui ne ressembleraient à rien de reconnaissable.
 *
 * Attention à ne pas confondre deux identifiants : LinuxGSM stocke celui du
 * *serveur dédié* (Garry's Mod = 4020), qui n'a pas de page boutique et donc
 * aucune image. C'est celui du *jeu* qu'il faut (4000), et seule la recherche
 * par nom le donne.
 */

const SEARCH = 'https://steamcommunity.com/actions/SearchApps/'
const CDN = 'https://cdn.cloudflare.steamstatic.com/steam/apps'

/** Une résolution ratée l'est durablement : on la garde aussi en cache. */
const TTL_MS = 7 * 24 * 60 * 60 * 1000

export interface GameArt {
  /**
   * Icône carrée du jeu, 32×32.
   *
   * C'est la seule image carrée que Steam publie. On l'affiche à sa taille
   * native : l'agrandir la rendrait floue, et une icône nette et petite se lit
   * mieux qu'une icône grande et baveuse.
   */
  icon: string | null
  /** Bandeau, pour une bannière de serveur. */
  header: string | null
}

const EMPTY: GameArt = { icon: null, header: null }

const cache = new Map<string, { at: number; art: GameArt }>()

export async function gameArt(name: string): Promise<GameArt> {
  const key = name.toLowerCase().trim()
  const hit = cache.get(key)
  if (hit && Date.now() - hit.at < TTL_MS) return hit.art

  let art = EMPTY
  try {
    const res = await fetch(SEARCH + encodeURIComponent(name), {
      signal: AbortSignal.timeout(8000),
    })
    if (res.ok) {
      const list = (await res.json()) as { appid: string; name: string; icon?: string }[]
      // Le premier résultat est le plus pertinent ; on écarte les entrées
      // « Dedicated Server », qui n'ont pas de visuel.
      const match = list.find((a) => !/dedicated server/i.test(a.name)) ?? list[0]
      const appId = match ? Number(match.appid) || null : null
      if (appId) {
        art = {
          icon: match?.icon || null,
          header: `${CDN}/${appId}/header.jpg`,
        }
      }
    }
  } catch {
    art = EMPTY
  }

  cache.set(key, { at: Date.now(), art })
  return art
}

/** Résout plusieurs jeux à la fois, en tolérant les échecs isolés. */
export async function gameArtMany(names: string[]): Promise<Map<string, GameArt>> {
  const out = new Map<string, GameArt>()
  await Promise.all(
    names.map(async (n) => {
      out.set(n, await gameArt(n).catch(() => EMPTY))
    }),
  )
  return out
}
