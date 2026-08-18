export type ThemeChoice = 'system' | 'light' | 'dark'
export type Theme = 'light' | 'dark'

const STORAGE_KEY = 'cairn-theme'

const THEME_COLOR: Record<Theme, string> = {
  dark: '#0A0B0F',
  light: '#EEF0F3',
}

function systemTheme(): Theme {
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'
}

/**
 * Applique le choix au DOM et met à jour `theme-color`. Le script bloquant
 * de `nuxt.config.ts` a déjà posé `data-theme` avant l'hydratation pour un
 * choix explicite : ici on gère aussi bien la mise à jour que le retour au
 * mode "système" (qui doit retirer l'attribut, pas le fixer).
 */
function apply(resolved: Theme, explicit: boolean) {
  if (explicit) document.documentElement.dataset.theme = resolved
  else delete document.documentElement.dataset.theme

  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute('content', THEME_COLOR[resolved])
}

/** N'écoute la préférence système qu'une fois, quel que soit le nombre de composants montés. */
let systemListenerBound = false

export function useTheme() {
  const choice = useState<ThemeChoice>('theme-choice', () => 'system')
  const resolved = useState<Theme>('theme-resolved', () => 'dark')

  function setTheme(next: ThemeChoice) {
    choice.value = next
    if (!import.meta.client) return

    try {
      if (next === 'system') localStorage.removeItem(STORAGE_KEY)
      else localStorage.setItem(STORAGE_KEY, next)
    } catch {
      // Stockage indisponible (navigation privée) : le choix reste actif
      // pour la session en cours, simplement pas persisté.
    }

    resolved.value = next === 'system' ? systemTheme() : next
    apply(resolved.value, next !== 'system')
  }

  /** Resynchronise l'état Vue sur ce que le script anti-flash a déjà posé au chargement. */
  function sync() {
    if (!import.meta.client) return

    let stored: string | null = null
    try {
      stored = localStorage.getItem(STORAGE_KEY)
    } catch {
      stored = null
    }

    choice.value = stored === 'light' || stored === 'dark' ? stored : 'system'
    resolved.value = choice.value === 'system' ? systemTheme() : choice.value
    apply(resolved.value, choice.value !== 'system')

    if (!systemListenerBound) {
      systemListenerBound = true
      window.matchMedia('(prefers-color-scheme: light)').addEventListener('change', () => {
        if (choice.value !== 'system') return
        resolved.value = systemTheme()
        apply(resolved.value, false)
      })
    }
  }

  return { choice, resolved, setTheme, sync }
}
