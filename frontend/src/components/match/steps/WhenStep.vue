<template>
  <div class="flex flex-col gap-6 pt-4">
    <h3 class="text-base font-semibold">{{ t('whenStep.title') }}</h3>

    <div class="grid grid-cols-2 gap-3">
      <button
        v-for="card in quickCards"
        :key="card.key"
        type="button"
        class="flex flex-col items-center justify-center gap-1 rounded-lg border-2 p-4 transition-colors cursor-pointer"
        :class="
          selectedQuick === card.key
            ? 'border-primary bg-primary/10 text-primary'
            : 'border-slate-200 dark:border-slate-700 hover:border-primary/50'
        "
        @click="selectQuick(card.key)"
      >
        <i :class="[card.icon, 'text-xl']" />
        <span class="text-sm font-medium">{{ card.label }}</span>
      </button>
    </div>

    <div v-if="selectedQuick === 'custom'" class="flex flex-col gap-2">
      <label for="when-custom-date" class="text-sm font-medium">{{
        t('whenStep.dateTimeLabel')
      }}</label>
      <UInputDate
        id="when-custom-date"
        v-model="customDateTime"
        granularity="minute"
        :hour-cycle="24"
        :min-value="minValue"
        :max-value="maxValue"
        size="xl"
        class="w-full"
      >
        <template #trailing>
          <UPopover>
            <UButton
              color="neutral"
              variant="link"
              size="sm"
              icon="i-fa7-solid:calendar"
              :aria-label="t('whenStep.dateTimeLabel')"
              class="px-0"
            />
            <template #content>
              <UCalendar
                v-model="customDay"
                :min-value="minValue"
                :max-value="maxValue"
                class="p-2"
              />
            </template>
          </UPopover>
        </template>
      </UInputDate>
      <div class="flex justify-between">
        <UButton
          size="sm"
          color="neutral"
          variant="ghost"
          :label="t('whenStep.now')"
          @click="onCustomDate((customDate = new Date()))"
        />
        <UButton
          size="sm"
          color="neutral"
          variant="ghost"
          :label="t('whenStep.clearButton')"
          @click="onCustomDate((customDate = null))"
        />
      </div>
    </div>

    <!-- Outside the custom block: "now" can fall outside a tournament that has ended. -->
    <p v-if="rangeMessage" role="alert" class="text-sm text-error" data-testid="when-range-error">
      <i class="fa fa-circle-exclamation mr-1" />{{ rangeMessage }}
    </p>

    <div v-if="!hideNavigation" class="flex justify-end pt-2">
      <UButton
        :label="t('whenStep.next')"
        trailing-icon="i-fa7-solid:arrow-right"
        size="lg"
        :disabled="!playedAtModel || !!rangeIssue"
        @click="emit('next')"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import type { DateValue } from '@internationalized/date'
import {
  fromCalendarDateTime,
  toCalendarDate,
  toCalendarDateTime,
} from '@/utils/calendar-date'
import { dateToStringDDMMYYYY, dateToStringDDMMYYYYHHMM } from '@/utils/DateUtils'
import { dateRangeIssue } from '@/composables/match/useMatchDateBounds'

type QuickKey = 'now' | 'minus5' | 'minus10' | 'custom'

interface Props {
  minDate?: Date | null
  maxDate?: Date | null
  hideNavigation?: boolean
}

interface Emits {
  (e: 'next'): void
}

const props = defineProps<Props>()
const emit = defineEmits<Emits>()
const { t } = useI18n()

const playedAtModel = defineModel<Date | null>('playedAt', { default: null })

const quickCards = computed(() => [
  { key: 'now' as QuickKey, label: t('whenStep.now'), icon: 'fas fa-bolt' },
  { key: 'minus5' as QuickKey, label: t('whenStep.minus5'), icon: 'fas fa-clock' },
  { key: 'minus10' as QuickKey, label: t('whenStep.minus10'), icon: 'fas fa-history' },
  { key: 'custom' as QuickKey, label: t('whenStep.custom'), icon: 'fas fa-calendar-alt' },
])

const selectedQuick = ref<QuickKey | null>(null)
const customDate = ref<Date | null>(null)

function dateForKey(key: QuickKey): Date | null {
  if (key === 'now') return new Date()
  if (key === 'minus5') return new Date(Date.now() - 5 * 60 * 1000)
  if (key === 'minus10') return new Date(Date.now() - 10 * 60 * 1000)
  return null
}

function selectQuick(key: QuickKey) {
  selectedQuick.value = key
  if (key !== 'custom') {
    playedAtModel.value = dateForKey(key)
    customDate.value = null
  } else {
    playedAtModel.value = customDate.value
  }
}

function onCustomDate(date: Date | null) {
  playedAtModel.value = date
}

const minValue = computed(() => toCalendarDateTime(props.minDate))
const maxValue = computed(() => toCalendarDateTime(props.maxDate))

/** The typed date and time; the input emits on every segment, each one a valid instant. */
const customDateTime = computed({
  get: () => toCalendarDateTime(customDate.value),
  set: (value: DateValue | undefined) => {
    customDate.value = fromCalendarDateTime(value) ?? null
    onCustomDate(customDate.value)
  },
})

/** The calendar picks the day only: the time already typed is kept. */
const customDay = computed({
  get: () => toCalendarDate(customDate.value),
  set: (value: DateValue | undefined) => {
    if (!value) return
    const time = customDate.value ?? new Date()
    const date = new Date(time)
    date.setFullYear(value.year, value.month - 1, value.day)
    customDate.value = date
    onCustomDate(date)
  },
})

const rangeIssue = computed(() =>
  dateRangeIssue(playedAtModel.value, props.minDate, props.maxDate),
)

/** The red field alone said nothing about why, nor which dates would do. */
const rangeMessage = computed(() => {
  if (rangeIssue.value === 'tooEarly') {
    return t('whenStep.tooEarly', { date: dateToStringDDMMYYYYHHMM(props.minDate ?? undefined) })
  }
  if (rangeIssue.value === 'tooLate') {
    return t('whenStep.tooLate', { date: dateToStringDDMMYYYY(props.maxDate) })
  }
  return null
})

function triggerNext() {
  if (playedAtModel.value && !rangeIssue.value) emit('next')
}

defineExpose({ triggerNext })

watch(
  playedAtModel,
  (newVal) => {
    if (newVal && selectedQuick.value === null) {
      selectedQuick.value = 'custom'
      customDate.value = newVal
    }
  },
  { immediate: true },
)
</script>
