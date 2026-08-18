/**
 * Retire un compte admin.
 *
 * On ne se supprime pas soi-même : ça verrouillerait la requête en cours de
 * route, autant demander à un autre compte de le faire. Cette seule règle
 * empêche déjà de supprimer le dernier compte restant — s'il n'en reste
 * qu'un, il ne peut s'agir que de l'appelant.
 */
export default defineEventHandler(async (event) => {
  const me = await requireUser(event)

  const id = Number(getRouterParam(event, 'id'))
  if (!Number.isInteger(id)) {
    throw createError({ statusCode: 400, statusMessage: 'Identifiant invalide.' })
  }

  if (id === me.id) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Un autre compte doit supprimer le tien.',
    })
  }

  const info = useDb().prepare('DELETE FROM users WHERE id = ?').run(id)
  if (info.changes === 0) {
    throw createError({ statusCode: 404, statusMessage: 'Compte introuvable.' })
  }

  return { ok: true }
})
