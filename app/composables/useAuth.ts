interface AuthUser {
  id: number
  username: string
}

interface AuthState {
  user: AuthUser | null
  needsSetup: boolean
  host: string
  loaded: boolean
}

export function useAuth() {
  const state = useState<AuthState>('auth', () => ({
    user: null,
    needsSetup: false,
    host: '',
    loaded: false,
  }))

  /** Interroge le serveur une seule fois par navigation. */
  async function refresh() {
    // useRequestFetch transmet le cookie de session pendant le rendu serveur.
    const res = await useRequestFetch()('/api/auth/state')
    state.value = {
      user: res.user,
      needsSetup: res.needsSetup,
      host: res.host,
      loaded: true,
    }
    return state.value
  }

  async function login(username: string, password: string) {
    const res = await $fetch('/api/auth/login', {
      method: 'POST',
      body: { username, password },
    })
    state.value = { ...state.value, user: res.user, needsSetup: false, loaded: true }
  }

  async function setup(username: string, password: string) {
    const res = await $fetch('/api/auth/setup', {
      method: 'POST',
      body: { username, password },
    })
    state.value = { ...state.value, user: res.user, needsSetup: false, loaded: true }
  }

  async function logout() {
    await $fetch('/api/auth/logout', { method: 'POST' })
    state.value = { ...state.value, user: null, loaded: true }
    await navigateTo('/login')
  }

  return { state, refresh, login, setup, logout }
}
