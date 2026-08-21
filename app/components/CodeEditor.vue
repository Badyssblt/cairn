<script setup lang="ts">
/**
 * Éditeur de code (CodeMirror 6) : coloration syntaxique selon l'extension,
 * autocomplétion, appariement des accolades, recherche — pour que l'onglet
 * "Texte" soit un vrai éditeur et pas un `<textarea>` nu.
 *
 * Le doc CodeMirror est la source de vérité pendant la frappe ; `modelValue`
 * n'est resynchronisé vers lui que lorsqu'il change *sans* venir d'ici (ex.
 * bascule formulaire -> texte), sans quoi le curseur sauterait à chaque
 * caractère tapé.
 */
import { EditorState, Compartment, type Extension } from '@codemirror/state'
import { EditorView, keymap } from '@codemirror/view'
import { indentWithTab } from '@codemirror/commands'
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language'
import { type CompletionContext, type CompletionResult } from '@codemirror/autocomplete'
import { tags as t } from '@lezer/highlight'
import { basicSetup } from 'codemirror'

const props = defineProps<{ modelValue: string; path: string }>()
const emit = defineEmits<{ 'update:modelValue': [value: string] }>()

/**
 * Complétion sur les mots déjà présents dans le fichier : les formats
 * comme YAML, TOML ou .properties n'ont pas de source de complétion
 * sémantique (contrairement à JS ou XML), mais reproposer une clé ou une
 * valeur déjà tapée plus haut reste utile dans un config de plugin.
 */
function wordCompletionSource(context: CompletionContext): CompletionResult | null {
  const word = context.matchBefore(/[\w-]+/)
  if (!word || (word.from === word.to && !context.explicit)) return null

  const doc = context.state.doc
  if (doc.length > 500_000) return null

  const seen = new Set<string>()
  const options: { label: string }[] = []
  for (const match of doc.toString().matchAll(/[A-Za-z_][\w-]{1,}/g)) {
    const w = match[0]
    if (w === word.text || seen.has(w)) continue
    seen.add(w)
    options.push({ label: w })
  }
  return { from: word.from, options, validFor: /^[\w-]*$/ }
}

const host = ref<HTMLDivElement | null>(null)
let view: EditorView | null = null
const languageCompartment = new Compartment()

/**
 * Uniquement les couleurs de la palette "Deepslate & Torchlight" (voir
 * main.css) : le vert et le rouge restent des statuts (marche/erreur), donc
 * hors-jeu pour la coloration syntaxique — sauf `invalid`, qui EST une
 * erreur.
 */
const highlightStyle = HighlightStyle.define([
  { tag: [t.comment, t.lineComment, t.blockComment], color: 'var(--color-ash-dim)', fontStyle: 'italic' },
  { tag: [t.string, t.special(t.string), t.regexp], color: 'var(--color-lapis)' },
  { tag: [t.number, t.bool, t.null, t.atom], color: 'var(--color-torch-lit)' },
  { tag: [t.keyword, t.controlKeyword, t.operatorKeyword], color: 'var(--color-torch)' },
  { tag: [t.propertyName, t.definition(t.propertyName)], color: 'var(--color-chalk)', fontWeight: '600' },
  { tag: [t.attributeName], color: 'var(--color-lapis)' },
  { tag: [t.tagName], color: 'var(--color-torch)' },
  { tag: [t.punctuation, t.bracket, t.separator, t.derefOperator], color: 'var(--color-ash)' },
  { tag: [t.meta], color: 'var(--color-ash-dim)' },
  { tag: [t.invalid], color: 'var(--color-redstone)' },
])

const editorTheme = EditorView.theme({
  '&': {
    backgroundColor: 'var(--color-deepslate)',
    color: 'var(--color-chalk)',
    height: '100%',
    fontSize: '12px',
  },
  '.cm-content': {
    fontFamily: 'var(--font-mono)',
    caretColor: 'var(--color-torch)',
    padding: '12px 0',
  },
  '.cm-scroller': { fontFamily: 'var(--font-mono)' },
  '&.cm-focused': { outline: 'none' },
  '.cm-cursor, .cm-dropCursor': { borderLeftColor: 'var(--color-torch)' },
  '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, ::selection': {
    backgroundColor: 'var(--color-torch-dim) !important',
  },
  '.cm-gutters': {
    backgroundColor: 'var(--color-stone)',
    color: 'var(--color-ash-dim)',
    border: 'none',
    borderRight: '1px solid var(--color-vein)',
  },
  '.cm-activeLineGutter': {
    backgroundColor: 'var(--color-stone-lit)',
    color: 'var(--color-ash)',
  },
  '.cm-activeLine': {
    backgroundColor: 'color-mix(in srgb, var(--color-stone-lit) 55%, transparent)',
  },
  '.cm-matchingBracket, .cm-nonmatchingBracket': {
    backgroundColor: 'var(--color-lapis-dim)',
    outline: '1px solid var(--color-lapis)',
  },
  '.cm-foldPlaceholder': {
    backgroundColor: 'var(--color-stone-lit)',
    border: '1px solid var(--color-vein)',
    color: 'var(--color-ash)',
  },
  '.cm-tooltip': {
    backgroundColor: 'var(--color-stone)',
    border: '1px solid var(--color-vein)',
    color: 'var(--color-chalk)',
  },
  '.cm-tooltip-autocomplete ul li[aria-selected]': {
    backgroundColor: 'var(--color-torch-dim)',
    color: 'var(--color-torch-lit)',
  },
  '.cm-panels': { backgroundColor: 'var(--color-stone)', color: 'var(--color-chalk)' },
  '.cm-panels.cm-panels-top': { borderBottom: '1px solid var(--color-vein)' },
  '.cm-panels.cm-panels-bottom': { borderTop: '1px solid var(--color-vein)' },
  '.cm-textfield, .cm-button': {
    backgroundColor: 'var(--color-stone-lit)',
    border: '1px solid var(--color-vein)',
    color: 'var(--color-chalk)',
  },
  '.cm-searchMatch': { backgroundColor: 'var(--color-lapis-dim)' },
  '.cm-searchMatch.cm-searchMatch-selected': { backgroundColor: 'var(--color-torch-dim)' },
  '.cm-selectionMatch': { backgroundColor: 'var(--color-lapis-dim)' },
})

function buildExtensions(): Extension[] {
  return [
    basicSetup,
    keymap.of([indentWithTab]),
    editorTheme,
    syntaxHighlighting(highlightStyle),
    languageCompartment.of(languageForPath(props.path) ?? []),
    EditorState.languageData.of(() => [{ autocomplete: wordCompletionSource }]),
    EditorView.lineWrapping,
    EditorView.updateListener.of((update) => {
      if (update.docChanged) emit('update:modelValue', update.state.doc.toString())
    }),
  ]
}

onMounted(() => {
  view = new EditorView({
    state: EditorState.create({ doc: props.modelValue, extensions: buildExtensions() }),
    parent: host.value!,
  })
})

onBeforeUnmount(() => view?.destroy())

watch(
  () => props.path,
  (path) => {
    view?.dispatch({ effects: languageCompartment.reconfigure(languageForPath(path) ?? []) })
  },
)

watch(
  () => props.modelValue,
  (value) => {
    if (!view) return
    const current = view.state.doc.toString()
    if (value === current) return
    view.dispatch({ changes: { from: 0, to: current.length, insert: value } })
  },
)
</script>

<template>
  <div class="flex h-[26rem] flex-col">
    <div ref="host" class="min-h-0 flex-1 overflow-hidden" />
    <p class="border-t border-vein bg-stone px-3 py-1 font-mono text-[10px] text-ash-dim">
      Tab indente le code · Échap puis Tab pour sortir du champ
    </p>
  </div>
</template>
