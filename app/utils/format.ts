/**
 * Un seul endroit qui décide de la virgule française et du zéro inutile :
 * sans lui, "13 Go" s'affichait "13,0 Go" partout où un Mo était converti en
 * Go avec un `toFixed(1)` fixe.
 */
const fr1 = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 })

export function formatNumberFr(n: number): string {
  return fr1.format(n)
}

/** Mo -> nombre de Go, sans unité : les appelants ajoutent "Go" eux-mêmes. */
export function formatGb(mb: number | null | undefined): string {
  return mb === null || mb === undefined ? '—' : fr1.format(mb / 1024)
}

/** Octets -> "X Go", pour des tailles déjà connues être de cet ordre. */
export function formatBytesGb(bytes: number): string {
  return `${fr1.format(bytes / 1073741824)} Go`
}

/** Mo -> "X Mo" ou "X Go" selon l'ordre de grandeur. */
export function formatMb(mb: number): string {
  return mb >= 1024 ? `${formatGb(mb)} Go` : `${Math.round(mb)} Mo`
}

/** Un instant passé, dit court : la précision à la minute près ne sert à rien. */
export function formatRelativeTime(ms: number): string {
  const diff = Date.now() - ms
  const min = Math.floor(diff / 60_000)
  if (min < 1) return "à l'instant"
  if (min < 60) return `il y a ${min} min`
  const h = Math.floor(min / 60)
  if (h < 24) return `il y a ${h} h`
  const d = Math.floor(h / 24)
  if (d < 7) return `il y a ${d} j`
  return new Date(ms).toLocaleDateString('fr-FR')
}
