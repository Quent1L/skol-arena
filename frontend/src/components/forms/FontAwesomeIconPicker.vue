<template>
  <div>
    <UButton
      color="neutral"
      variant="outline"
      block
      class="justify-start gap-3"
      trailing-icon="i-fa7-solid:chevron-down"
      :ui="{ trailingIcon: 'ms-auto size-3 text-dimmed' }"
      @click="open"
    >
      <!-- Stored values are runtime class strings (FA webfont or compiled Iconify CSS). -->
      <i :class="modelValue || 'fas fa-question'" class="w-8 text-center text-2xl text-primary" />
      <span class="truncate text-sm text-muted">{{ currentLabel }}</span>
    </UButton>

    <UModal
      v-model:open="visible"
      :title="t('fontAwesomeIconPicker.dialogHeader')"
      :ui="{ content: 'sm:max-w-3xl', footer: 'justify-between' }"
    >
      <template #body>
        <div class="space-y-3">
          <UInput
            v-model="search"
            autofocus
            icon="i-fa7-solid:magnifying-glass"
            :placeholder="t('fontAwesomeIconPicker.searchPlaceholder')"
            class="w-full"
          />

          <!-- Tabs (hidden when searching): one scrollable row rather than a wall of chips on phones -->
          <div v-if="!search" class="no-scrollbar -mx-1 flex gap-1 overflow-x-auto px-1 sm:flex-wrap">
            <UButton
              v-for="tab in TABS"
              :key="tab.key"
              size="xs"
              :color="activeTab === tab.key ? 'primary' : 'neutral'"
              :variant="activeTab === tab.key ? 'solid' : 'soft'"
              class="shrink-0"
              data-testid="icon-picker-tab"
              :label="tab.label"
              @click="activeTab = tab.key"
            />
          </div>

          <p class="text-xs text-dimmed">
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

          <div
            class="grid h-[50vh] grid-cols-4 content-start gap-1 overflow-y-auto pr-1 sm:h-80 sm:grid-cols-6 md:grid-cols-8"
          >
            <button
              v-for="icon in displayedIcons"
              :key="icon.name"
              type="button"
              :title="icon.label"
              class="flex min-w-0 flex-col items-center gap-1 rounded-md p-2 transition-colors hover:bg-elevated"
              :class="modelValue === icon.class ? 'bg-primary/10 ring-2 ring-primary' : ''"
              @click="select(icon.class)"
            >
              <i :class="icon.class" class="text-xl" />
              <span class="w-full truncate text-center text-[10px] leading-tight">{{
                icon.label
              }}</span>
            </button>
          </div>
        </div>
      </template>

      <template #footer>
        <UButton
          v-if="modelValue"
          :label="t('fontAwesomeIconPicker.clear')"
          icon="i-fa7-solid:xmark"
          color="neutral"
          variant="ghost"
          @click="clear"
        />
        <UButton
          :label="t('common.close')"
          color="neutral"
          variant="ghost"
          class="ms-auto"
          @click="visible = false"
        />
      </template>
    </UModal>
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
