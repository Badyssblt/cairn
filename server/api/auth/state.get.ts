import { hostname } from 'node:os'

/**
 * Dit à l'écran de connexion dans quel monde il se trouve : première
 * installation (aucun compte) ou connexion normale. Route publique.
 *
 * Le nom d'hôte est renvoyé parce que le panneau est self-hosted : quand on en
 * administre plusieurs, savoir sur quelle machine on s'apprête à entrer est
 * une information, pas une décoration.
 */
export default defineEventHandler(async (event) => {
  const user = await currentUser(event)
  return {
    needsSetup: countUsers() === 0,
    host: hostname(),
    user,
  }
})
