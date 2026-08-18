import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { dirname, join } from 'node:path'

/**
 * Configuration LinuxGSM.
 *
 * LinuxGSM répartit ses réglages sur trois fichiers, du plus général au plus
 * précis :
 *
 *   `_default.cfg`     valeurs livrées, marquées « DO NOT EDIT » car réécrites
 *                      à chaque mise à jour ;
 *   `common.cfg`       ce que l'utilisateur applique à toutes ses instances ;
 *   `<instance>.cfg`   ce qu'il applique à celle-ci.
 *
 * Les deux derniers sont **vides à la création** : on y recopie une ligne de
 * `_default.cfg` pour la surcharger. Ouvrir seulement le fichier d'instance
 * montre donc un fichier quasi vide, sans dire ce qui est réglable — c'est
 * exact et inutilisable.
 *
 * On présente donc la configuration *effective*, et on n'écrit dans le fichier
 * d'instance que ce qui s'écarte de la valeur par défaut.
 */

export interface LgsmEntry {
  key: string
  value: string
  /** Valeur livrée par LinuxGSM. */
  defaultValue: string
  /** L'utilisateur a-t-il changé cette valeur ? */
  overridden: boolean
}

/** Lit les affectations `clé="valeur"` d'un fichier de configuration shell. */
export function parseCfg(raw: string): Record<string, string> {
  const out: Record<string, string> = {}

  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue

    const m = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/)
    if (!m) continue

    let value = m[2]!.trim()
    // Les valeurs sont entre guillemets dans les fichiers LinuxGSM.
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    out[m[1]!] = value
  }
  return out
}

async function readIfExists(path: string): Promise<string> {
  try {
    return await readFile(path, 'utf8')
  } catch {
    return ''
  }
}

export interface LgsmConfig {
  /** Chemin du fichier d'instance, celui qu'on écrit. */
  instancePath: string
  entries: LgsmEntry[]
  /** Le serveur a-t-il déjà été lancé une fois ? */
  initialized: boolean
}

export async function readLgsmConfig(
  dataDir: string,
  service: string,
): Promise<LgsmConfig> {
  const dir = join(dataDir, 'config-lgsm', service)
  const instanceRel = `config-lgsm/${service}/${service}.cfg`

  const defaults = parseCfg(await readIfExists(join(dir, '_default.cfg')))
  const common = parseCfg(await readIfExists(join(dir, 'common.cfg')))
  const instance = parseCfg(await readIfExists(join(dir, `${service}.cfg`)))

  const overrides = { ...common, ...instance }

  const entries: LgsmEntry[] = Object.entries(defaults).map(([key, defaultValue]) => ({
    key,
    value: overrides[key] ?? defaultValue,
    defaultValue,
    overridden: key in overrides && overrides[key] !== defaultValue,
  }))

  // Une clé ajoutée à la main n'existe pas dans les défauts : on la garde,
  // sinon l'enregistrement l'effacerait sans prévenir.
  for (const [key, value] of Object.entries(overrides)) {
    if (key in defaults) continue
    entries.push({ key, value, defaultValue: '', overridden: true })
  }

  entries.sort((a, b) => a.key.localeCompare(b.key))

  return {
    instancePath: instanceRel,
    entries,
    initialized: Object.keys(defaults).length > 0,
  }
}

const HEADER = `##################################
####### Instance Settings ########
##################################
# Écrit par Cairn. Seules les valeurs qui s'écartent de _default.cfg
# figurent ici : le reste suit les valeurs livrées par LinuxGSM.
`

/**
 * Écrit les surcharges. Une valeur ramenée à son défaut disparaît du fichier
 * plutôt que d'y être répétée : c'est ce qui garde le fichier lisible et
 * laisse les mises à jour de LinuxGSM reprendre la main sur ces lignes.
 */
export async function writeLgsmOverrides(
  dataDir: string,
  service: string,
  values: Record<string, string>,
  defaults: Record<string, string>,
): Promise<number> {
  const path = join(dataDir, 'config-lgsm', service, `${service}.cfg`)
  await mkdir(dirname(path), { recursive: true })

  const lines: string[] = []
  for (const [key, value] of Object.entries(values)) {
    if (defaults[key] === value) continue
    // Les guillemets internes casseraient l'affectation shell.
    lines.push(`${key}="${value.replace(/"/g, '\\"')}"`)
  }

  await writeFile(path, `${HEADER}\n${lines.join('\n')}\n`, 'utf8')
  return lines.length
}
