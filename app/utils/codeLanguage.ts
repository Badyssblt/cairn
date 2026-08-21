import type { Extension } from '@codemirror/state'
import { StreamLanguage } from '@codemirror/language'
import { json } from '@codemirror/lang-json'
import { yaml } from '@codemirror/lang-yaml'
import { xml } from '@codemirror/lang-xml'
import { javascript } from '@codemirror/lang-javascript'
import { markdown } from '@codemirror/lang-markdown'
import { toml } from '@codemirror/legacy-modes/mode/toml'
import { properties } from '@codemirror/legacy-modes/mode/properties'
import { shell } from '@codemirror/legacy-modes/mode/shell'
import { lua } from '@codemirror/legacy-modes/mode/lua'

/**
 * Coloration syntaxique selon l'extension : les fichiers de config des mods
 * et plugins n'ont pas de schéma connu d'avance (contrairement à
 * server.properties), mais leur format textuel, lui, se reconnaît toujours
 * à l'extension.
 */
export function languageForPath(path: string): Extension | null {
  const dot = path.lastIndexOf('.')
  const ext = dot === -1 ? '' : path.slice(dot).toLowerCase()

  switch (ext) {
    case '.json':
    case '.json5':
    case '.mcmeta':
      return json()
    case '.yml':
    case '.yaml':
      return yaml()
    case '.toml':
      return StreamLanguage.define(toml)
    case '.properties':
    case '.cfg':
    case '.conf':
    case '.ini':
      return StreamLanguage.define(properties)
    case '.xml':
      return xml()
    case '.js':
      return javascript()
    case '.sh':
      return StreamLanguage.define(shell)
    case '.lua':
      return StreamLanguage.define(lua)
    case '.md':
      return markdown()
    default:
      return null
  }
}
