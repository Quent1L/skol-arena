<template>
  <div>
    <button
      type="button"
      class="flex items-center gap-3 px-3 py-2 border border-surface-300 dark:border-surface-600 rounded-md hover:bg-surface-50 dark:hover:bg-surface-800 transition-colors w-full text-left"
      @click="open"
    >
      <i
        :class="modelValue || 'fas fa-question'"
        class="text-2xl text-purple-600 w-8 text-center"
      />
      <span class="flex-1 text-sm text-surface-600 dark:text-surface-400">
        {{ currentLabel }}
      </span>
      <i class="fas fa-chevron-down text-xs text-surface-400" />
    </button>

    <Dialog
      v-model:visible="visible"
      modal
      :header="t('fontAwesomeIconPicker.dialogHeader')"
      :style="{ width: '90vw', maxWidth: '760px' }"
      :draggable="false"
      @show="searchRef?.$el?.focus()"
    >
      <div class="space-y-3">
        <InputText
          ref="searchRef"
          v-model="search"
          :placeholder="t('fontAwesomeIconPicker.searchPlaceholder')"
          class="w-full"
        />

        <!-- Tabs (hidden when searching) -->
        <div v-if="!search" class="flex flex-wrap gap-1">
          <button
            v-for="tab in TABS"
            :key="tab.key"
            type="button"
            class="px-2 py-1 text-xs rounded transition-colors"
            :class="
              activeTab === tab.key
                ? 'bg-purple-600 text-white'
                : 'bg-surface-100 dark:bg-surface-700 hover:bg-surface-200 dark:hover:bg-surface-600'
            "
            @click="activeTab = tab.key"
          >
            {{ tab.label }}
          </button>
        </div>

        <p class="text-xs text-surface-400">
          <template v-if="search">
            {{ t('fontAwesomeIconPicker.resultCount', displayedIcons.length) }}
            <span v-if="filteredIcons.length > MAX_RESULTS">
              {{ t('fontAwesomeIconPicker.refineSearch', filteredIcons.length) }}
            </span>
          </template>
          <template v-else>
            {{ t('fontAwesomeIconPicker.iconCount', displayedIcons.length) }}
          </template>
        </p>

        <div class="h-80">
          <div class="grid grid-cols-6 sm:grid-cols-8 gap-1 max-h-80 overflow-y-auto pr-1">
            <button
              v-for="icon in displayedIcons"
              :key="icon.name"
              type="button"
              :title="icon.label"
              class="flex flex-col items-center gap-1 p-2 rounded hover:bg-surface-100 dark:hover:bg-surface-700 transition-colors min-w-0"
              :class="
                modelValue === icon.class
                  ? 'ring-2 ring-purple-500 bg-purple-50 dark:bg-purple-950'
                  : ''
              "
              @click="select(icon.class)"
            >
              <i :class="icon.class" class="text-xl" />
              <span class="text-[10px] truncate w-full text-center leading-tight">{{
                icon.label
              }}</span>
            </button>
          </div>
        </div>
      </div>

      <template #footer>
        <div class="flex justify-between items-center w-full">
          <Button
            v-if="modelValue"
            :label="t('fontAwesomeIconPicker.clear')"
            icon="fas fa-times"
            severity="secondary"
            text
            @click="clear"
          />
          <Button :label="t('common.close')" text class="ml-auto" @click="visible = false" />
        </div>
      </template>
    </Dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import iconsData from '@/config/fa-icons.json'
import categoriesData from '@/config/fa-categories.json'
import iconifyData from '@/config/iconify-icons.json'

type SlimIcon = { name: string; label: string; terms: string[] }
type CategoriesData = Record<string, { label: string; icons: string[] }>
type PickerIcon = SlimIcon & { class: string }
// Iconify icons are compiled to CSS classes by scripts/generate-iconify-icons.mjs, so a
// selected one is stored and rendered exactly like a Font Awesome class string.
type IconifyCategory = { key: string; label: string; icons: PickerIcon[] }
const faCategories = categoriesData as CategoriesData
const iconifyCategories = iconifyData as IconifyCategory[]

const props = defineProps<{ modelValue: string }>()
const emit = defineEmits<{ (e: 'update:modelValue', value: string): void }>()

const { t } = useI18n()

const MAX_RESULTS = 200

const FA_ICONS: PickerIcon[] = (iconsData as SlimIcon[]).map((ic) => ({
  name: ic.name,
  class: `fas fa-${ic.name}`,
  label: ic.label,
  terms: ic.terms,
}))

const ALL_ICONS: PickerIcon[] = [...iconifyCategories.flatMap((cat) => cat.icons), ...FA_ICONS]

const iconByName = new Map(ALL_ICONS.map((ic) => [ic.name, ic]))

const POPULAR_NAMES = [
  'mdi:billiards',
  'game-icons:babyfoot-players',
  'game-icons:dart',
  'mdi:table-tennis',
  'ph:boules',
  'trophy',
  'medal',
  'star',
  'crown',
  'certificate',
  'award',
  'ribbon',
  'ranking-star',
  'shield-halved',
  'shield',
  'fire',
  'bolt',
  'gem',
  'gamepad',
  'chess-knight',
  'rocket',
  'bullseye',
  'crosshairs',
  'chart-line',
  'arrow-trend-up',
  'graduation-cap',
  'brain',
  'dumbbell',
  'infinity',
  'heart',
  'skull',
  'eye',
  'ghost',
  'user-ninja',
  'user-secret',
  'hat-wizard',
  'snowflake',
  'sun',
  'moon',
  'leaf',
  'wind',
  'mountain',
  'fish',
  'flag',
  'check-circle',
  'ban',
  'peace',
  'music',
  'flask',
  'yin-yang',
  'dragon',
  'star-of-david',
  'ankh',
  'dharmachakra',
  'swords',
  'wand-magic-sparkles',
  'gun',
  'hand-fist',
  'person-running',
  'person-swimming',
  'dice',
  'puzzle-piece',
  'target',
]

const TABS = computed(() => [
  { key: 'popular', label: t('fontAwesomeIconPicker.tabPopular') },
  ...iconifyCategories.map(({ key, label }) => ({ key, label })),
  ...Object.entries(faCategories).map(([key, cat]) => ({ key, label: cat.label })),
])

const visible = ref(false)
const search = ref('')
const activeTab = ref('popular')
const searchRef = ref<{ $el: HTMLInputElement } | null>(null)

const filteredIcons = computed(() => {
  const q = search.value.toLowerCase().trim()
  if (q) {
    return ALL_ICONS.filter(
      (ic) =>
        ic.name.includes(q) ||
        ic.label.toLowerCase().includes(q) ||
        ic.terms.some((term) => term.toLowerCase().includes(q)),
    )
  }
  if (activeTab.value === 'popular') {
    return namesToIcons(POPULAR_NAMES)
  }
  const iconifyCategory = iconifyCategories.find((cat) => cat.key === activeTab.value)
  if (iconifyCategory) return iconifyCategory.icons
  return namesToIcons(faCategories[activeTab.value]?.icons ?? [])
})

function namesToIcons(names: string[]): PickerIcon[] {
  return names.map((n) => iconByName.get(n)).filter((ic): ic is PickerIcon => !!ic)
}

const displayedIcons = computed(() => filteredIcons.value.slice(0, MAX_RESULTS))

const currentLabel = computed(() => {
  if (!props.modelValue) return t('fontAwesomeIconPicker.chooseIcon')
  const found = ALL_ICONS.find((ic) => ic.class === props.modelValue)
  return found ? found.label : props.modelValue
})

function open() {
  search.value = ''
  visible.value = true
}

function select(iconClass: string) {
  emit('update:modelValue', iconClass)
  visible.value = false
}

function clear() {
  emit('update:modelValue', '')
  visible.value = false
}
</script>
