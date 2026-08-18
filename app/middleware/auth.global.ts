export default defineNuxtRouteMiddleware(async (to) => {
  const { state, refresh } = useAuth()

  if (!state.value.loaded) await refresh()

  const isLoginPage = to.path === '/login'

  if (!state.value.user && !isLoginPage) {
    return navigateTo('/login')
  }
  if (state.value.user && isLoginPage) {
    return navigateTo('/')
  }
})
