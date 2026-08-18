<script setup lang="ts">
/**
 * Édite une valeur YAML/TOML/JSON quelconque en s'appelant elle-même sur les
 * objets et tableaux : pas de schéma connu d'avance, donc pas de libellés,
 * juste un contrôle adapté au type rencontré.
 */
const props = defineProps<{ modelValue: unknown }>()
const emit = defineEmits<{ 'update:modelValue': [value: unknown] }>()

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === 'object' && !Array.isArray(v)

function set(value: unknown) {
  emit('update:modelValue', value)
}

function setKey(key: string, value: unknown) {
  set({ ...(props.modelValue as Record<string, unknown>), [key]: value })
}
function removeKey(key: string) {
  const next = { ...(props.modelValue as Record<string, unknown>) }
  delete next[key]
  set(next)
}
const newKey = ref('')
function addKey() {
  const key = newKey.value.trim()
  if (!key || key in (props.modelValue as Record<string, unknown>)) return
  setKey(key, '')
  newKey.value = ''
}

function setItem(i: number, value: unknown) {
  const next = [...(props.modelValue as unknown[])]
  next[i] = value
  set(next)
}
function removeItem(i: number) {
  const next = [...(props.modelValue as unknown[])]
  next.splice(i, 1)
  set(next)
}
function addItem() {
  const arr = props.modelValue as unknown[]
  const last = arr[arr.length - 1]
  const blank = typeof last === 'number' ? 0 : typeof last === 'boolean' ? false : ''
  set([...arr, blank])
}
</script>

<template>
  <div v-if="isPlainObject(modelValue)" class="space-y-2">
    <div
      v-for="key in Object.keys(modelValue)"
      :key="key"
      class="rounded-block border border-vein/60 px-3 py-2"
    >
      <div class="flex items-center justify-between gap-2">
        <span class="font-mono text-[12px] text-ash-dim">{{ key }}</span>
        <button
          type="button"
          class="text-[11px] text-ash-dim hover:text-redstone"
          @click="removeKey(key)"
        >
          Retirer
        </button>
      </div>
      <div class="mt-1.5">
        <StructuredValue
          :model-value="modelValue[key]"
          @update:model-value="(v) => setKey(key, v)"
        />
      </div>
    </div>

    <div class="flex items-center gap-2 pt-1">
      <input
        v-model="newKey"
        placeholder="Nouvelle clé…"
        aria-label="Nom de la nouvelle clé"
        class="h-8 flex-1 rounded-block border border-vein bg-deepslate px-2.5 font-mono text-[12px] text-chalk placeholder:text-ash-dim/70 focus:border-torch focus:outline-none"
        @keydown.enter.prevent="addKey"
      />
      <UiBtn size="sm" variant="ghost" @click="addKey">Ajouter</UiBtn>
    </div>
  </div>

  <div v-else-if="Array.isArray(modelValue)" class="space-y-2">
    <div v-for="(item, i) in modelValue" :key="i" class="flex items-start gap-2">
      <span class="mt-2 w-4 shrink-0 font-mono text-[11px] text-ash-dim">{{ i }}</span>
      <div class="min-w-0 flex-1">
        <StructuredValue :model-value="item" @update:model-value="(v) => setItem(i, v)" />
      </div>
      <button
        type="button"
        class="mt-1.5 shrink-0 text-[11px] text-ash-dim hover:text-redstone"
        @click="removeItem(i)"
      >
        Retirer
      </button>
    </div>
    <UiBtn size="sm" variant="ghost" @click="addItem">Ajouter un élément</UiBtn>
  </div>

  <label v-else-if="typeof modelValue === 'boolean'" class="flex h-9 items-center gap-2.5">
    <input
      type="checkbox"
      :checked="modelValue"
      class="h-4 w-4 shrink-0 rounded-[2px] border border-vein-lit bg-deepslate accent-torch"
      @change="set(($event.target as HTMLInputElement).checked)"
    />
    <span class="font-mono text-[12px] text-ash">{{ modelValue ? 'activé' : 'désactivé' }}</span>
  </label>

  <input
    v-else-if="typeof modelValue === 'number'"
    type="number"
    :value="modelValue"
    class="h-9 w-full rounded-block border border-vein bg-deepslate px-2.5 font-mono text-[12px] text-chalk focus:border-torch focus:outline-none"
    @input="set(($event.target as HTMLInputElement).valueAsNumber)"
  />

  <div v-else-if="modelValue === null || modelValue === undefined" class="flex items-center gap-2">
    <span class="font-mono text-[11px] text-ash-dim">vide</span>
    <button type="button" class="text-[11px] text-ash-dim hover:text-torch" @click="set('')">
      Définir une valeur
    </button>
  </div>

  <textarea
    v-else
    :value="String(modelValue)"
    rows="1"
    spellcheck="false"
    aria-label="Valeur"
    class="min-h-9 w-full resize-y rounded-block border border-vein bg-deepslate px-2.5 py-1.5 font-mono text-[12px] text-chalk focus:border-torch focus:outline-none"
    @input="set(($event.target as HTMLTextAreaElement).value)"
  />
</template>
