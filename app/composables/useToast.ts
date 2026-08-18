export interface Toast {
  id: number
  text: string
  tone: 'info' | 'success' | 'error'
}

let nextId = 0

/**
 * File de toasts, partagée entre toutes les pages (même principe que
 * `useAuth`) : une action déclenchée depuis n'importe où doit pouvoir se
 * signaler sans que chaque page monte son propre système.
 */
export function useToast() {
  const toasts = useState<Toast[]>('toasts', () => [])

  function push(text: string, opts?: { tone?: Toast['tone']; durationMs?: number }) {
    const id = nextId++
    toasts.value = [...toasts.value, { id, text, tone: opts?.tone ?? 'info' }]

    if (import.meta.client) {
      setTimeout(() => dismiss(id), opts?.durationMs ?? 4000)
    }
    return id
  }

  function dismiss(id: number) {
    toasts.value = toasts.value.filter((t) => t.id !== id)
  }

  return { toasts, push, dismiss }
}
