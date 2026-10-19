<template>
  <div class="max-w-[1600px]">
    <div class="mb-4 flex flex-wrap items-center gap-3">
      <h1 class="text-2xl font-bold text-highlighted">
        {{ isEdit ? t('rulesEngineFormView.editTitle') : t('rulesEngineFormView.newTitle') }}
      </h1>
      <UBadge :label="t('rulesEngineFormView.betaTag')" color="warning" variant="subtle" />
    </div>

    <UAlert
      color="warning"
      variant="subtle"
      icon="i-fa7-solid:triangle-exclamation"
      :description="t('rulesEngineFormView.betaWarning')"
      class="mb-3"
    />

    <!-- The patch chain gave up on this rule and deactivated it. Saving clears the
         flag, but only the condition below can actually be saved once fixed: the
         builder no longer offers the retired variable. -->
    <UAlert
      v-if="currentRule?.disabledReason"
      color="error"
      variant="subtle"
      :title="t('rulesEngineFormView.migrationDisabledTitle')"
      class="mb-3"
    >
      <template #description>
        <p>{{ t('rulesEngineFormView.migrationDisabledHelp') }}</p>
        <p class="mt-2 font-mono">{{ currentRule.disabledReason }}</p>
      </template>
    </UAlert>

    <UAlert
      v-if="error"
      color="error"
      variant="subtle"
      icon="i-fa7-solid:circle-xmark"
      :description="error"
      class="mb-3"
    />

    <!-- Narrow card padding on phones: the condition builder nests several boxes. -->
    <div class="grid grid-cols-1 gap-4 xl:grid-cols-2 2xl:grid-cols-[320px_minmax(0,1fr)_360px]">
      <!-- Left panel: metadata -->
      <UCard :ui="{ body: 'p-3 sm:p-6' }">
        <template #header>
          <h2 class="font-semibold text-highlighted">
            {{ t('rulesEngineFormView.metadataTitle') }}
          </h2>
        </template>
        <div class="flex flex-col gap-4">
          <UFormField :label="t('rulesEngineFormView.labelName')" required>
            <UInput v-model="form.name" class="w-full" />
          </UFormField>
          <UFormField :label="t('rulesEngineFormView.labelDescription')">
            <UTextarea v-model="form.description" :rows="2" autoresize class="w-full" />
          </UFormField>
          <UFormField :label="t('rulesEngineFormView.labelType')">
            <UTabs v-model="form.type" :items="typeOptions" :content="false" size="sm" />
          </UFormField>
          <UFormField :label="t('rulesEngineFormView.labelTriggerEvent')">
            <USelect
              v-model="form.triggerEvent"
              :items="triggerOptions"
              class="w-full"
              @update:model-value="loadCatalog(form.triggerEvent)"
            />
          </UFormField>
          <UFormField :label="t('rulesEngineFormView.labelScope')">
            <UTabs v-model="form.scope" :items="scopeOptions" :content="false" size="sm" />
          </UFormField>
          <UFormField v-if="form.scope === 'discipline'" :label="t('common.discipline')" required>
            <USelectMenu
              v-model="form.disciplineId"
              :items="disciplineOptions"
              value-key="value"
              :placeholder="t('rulesEngineFormView.placeholderDiscipline')"
              class="w-full"
            />
          </UFormField>
          <!-- Priority only arbitrates between message rules: every matching badge
               rule awards its badge, so the field would be inoperative there. -->
          <UFormField
            v-if="form.type === 'message'"
            :label="t('rulesEngineFormView.labelPriority')"
            :help="t('rulesEngineFormView.hintPriority')"
          >
            <UInputNumber
              :model-value="form.priority"
              class="w-full"
              @update:model-value="form.priority = $event ?? 0"
            />
          </UFormField>
          <UCheckbox v-model="form.isActive" :label="t('rulesEngineFormView.labelIsActive')" />
        </div>
      </UCard>

      <!-- Middle panel: conditions. Below 2xl it takes a full row under the other two. -->
      <UCard
        :ui="{ body: 'p-2 sm:p-6' }"
        class="xl:order-last xl:col-span-2 2xl:order-none 2xl:col-span-1"
      >
        <template #header>
          <h2 class="font-semibold text-highlighted">
            {{ t('rulesEngineFormView.conditionsTitle') }}
          </h2>
        </template>
        <ConditionBuilder
          v-model="form.conditions"
          :facts="conditionFacts"
          :players="players"
          :outcome-types="outcomeTypes"
          :outcome-reasons="outcomeReasons"
          :discipline-id="form.scope === 'discipline' ? form.disciplineId : null"
        />
      </UCard>

      <!-- Right panel: action -->
      <UCard :ui="{ body: 'p-3 sm:p-6' }">
        <template #header>
          <h2 class="font-semibold text-highlighted">
            {{
              form.type === 'badge'
                ? t('rulesEngineFormView.typeBadge')
                : t('rulesEngineFormView.typeMessage')
            }}
          </h2>
        </template>

        <!-- MESSAGE -->
        <div v-if="form.type === 'message'" class="flex flex-col gap-3">
          <div v-for="(variant, idx) in messageVariants" :key="idx" class="flex items-start gap-2">
            <UTextarea
              :model-value="variant"
              :rows="2"
              autoresize
              class="flex-1"
              @focus="activeVariant = idx"
              @update:model-value="messageVariants[idx] = String($event)"
            />
            <UButton
              v-if="messageVariants.length > 1"
              icon="i-fa7-solid:trash"
              color="error"
              variant="ghost"
              size="sm"
              :aria-label="t('common.delete')"
              @click="messageVariants.splice(idx, 1)"
            />
          </div>
          <UButton
            :label="t('rulesEngineFormView.addVariant')"
            icon="i-fa7-solid:plus"
            variant="ghost"
            size="sm"
            class="self-start"
            @click="messageVariants.push('')"
          />

          <div>
            <p class="mb-1 text-xs font-semibold text-muted">
              {{ t('rulesEngineFormView.variablesLabel') }}
            </p>
            <div class="flex flex-wrap gap-1">
              <UButton
                v-for="fact in catalog"
                :key="fact.key"
                :label="`{{${fact.key}}}`"
                color="neutral"
                variant="soft"
                size="xs"
                @click="insertVariable(fact.key)"
              />
            </div>
          </div>

          <div class="rounded-md bg-elevated p-3">
            <p class="mb-1 text-xs font-semibold text-muted">
              {{ t('rulesEngineFormView.previewLabel') }}
            </p>
            <p class="text-sm">{{ preview || '—' }}</p>
          </div>
        </div>

        <!-- BADGE -->
        <div v-else class="flex flex-col gap-4">
          <UFormField :label="t('rulesEngineFormView.labelIcon')" required>
            <FontAwesomeIconPicker v-model="badge.icon" />
          </UFormField>
          <UFormField :label="t('rulesEngineFormView.labelBadgeLabel')" required>
            <UInput
              v-model="badge.label"
              :placeholder="t('rulesEngineFormView.placeholderBadgeLabel')"
              class="w-full"
            />
          </UFormField>
          <UFormField :label="t('rulesEngineFormView.labelBadgeDescription')" required>
            <UTextarea
              v-model="badge.description"
              :rows="2"
              autoresize
              :placeholder="t('rulesEngineFormView.placeholderBadgeDescription')"
              class="w-full"
            />
          </UFormField>
          <UFormField
            :label="t('rulesEngineFormView.labelBadgeRecurrence')"
            :help="
              badge.recurrence === 'per_season'
                ? t('rulesEngineFormView.helpRecurrencePerSeason')
                : t('rulesEngineFormView.helpRecurrenceOnce')
            "
          >
            <UTabs
              v-model="badge.recurrence"
              :items="recurrenceOptions"
              :content="false"
              size="sm"
              :ui="{ label: 'whitespace-normal text-center' }"
            />
          </UFormField>
        </div>
      </UCard>
    </div>

    <div class="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end [&>*]:justify-center">
      <UButton
        :label="t('rulesEngineFormView.testButton')"
        icon="i-fa7-solid:flask"
        color="neutral"
        variant="outline"
        @click="openTest"
      />
      <UButton
        :label="t('common.cancel')"
        color="neutral"
        variant="ghost"
        to="/admin/rules-engine"
      />
      <UButton
        :label="t('rulesEngineFormView.saveButton')"
        icon="i-fa7-solid:floppy-disk"
        :loading="loading"
        @click="handleSave"
      />
    </div>

    <!-- Simulator -->
    <UModal
      v-model:open="testDialogVisible"
      :title="t('rulesEngineFormView.testDialogTitle')"
      :ui="{
        content: 'sm:max-w-2xl',
        footer: 'flex flex-col-reverse gap-2 sm:flex-row sm:justify-end',
      }"
    >
      <template #body>
        <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <UFormField v-for="fact in catalog" :key="fact.key" :label="fact.label" size="sm">
            <USelectMenu
              v-if="simulatorSelect(fact)"
              v-model="testContext[fact.key]"
              v-bind="simulatorSelect(fact)!"
              class="w-full"
            />
            <UInputTime
              v-else-if="fact.ref === 'time'"
              :model-value="minutesToTime(testContext[fact.key])"
              :hour-cycle="24"
              class="w-full"
              @update:model-value="testContext[fact.key] = timeToMinutes($event)"
            />
            <UInputDate
              v-else-if="fact.type === 'date'"
              :model-value="stringToDate(testContext[fact.key])"
              class="w-full"
              @update:model-value="testContext[fact.key] = $event ? $event.toString() : ''"
            />
            <UInputNumber
              v-else-if="fact.type === 'number'"
              v-model="testContext[fact.key] as number"
              class="w-full"
            />
            <UInput v-else v-model="testContext[fact.key] as string" class="w-full" />
          </UFormField>
        </div>
        <UAlert
          v-if="testResult"
          :color="testResult.matched ? 'success' : 'neutral'"
          variant="subtle"
          class="mt-4"
          :title="
            testResult.matched
              ? t('rulesEngineFormView.testMatched')
              : t('rulesEngineFormView.testNotMatched')
          "
        >
          <template v-if="testResult.output" #description>
            <p v-if="testResult.output.type === 'message'">{{ testResult.output.message }}</p>
            <p v-else-if="testResult.output.type === 'badge'">
              <i :class="testResult.output.badge.icon"></i>
              {{ testResult.output.badge.label }} — {{ testResult.output.badge.description }}
            </p>
          </template>
        </UAlert>
      </template>
      <template #footer>
        <UButton
          :label="t('rulesEngineFormView.closeButton')"
          color="neutral"
          variant="ghost"
          class="justify-center"
          @click="testDialogVisible = false"
        />
        <UButton
          :label="t('rulesEngineFormView.runTestButton')"
          icon="i-fa7-solid:play"
          class="justify-center"
          @click="runTest"
        />
      </template>
    </UModal>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { Time, parseDate, type DateValue } from '@internationalized/date'
import { useRulesService } from '@/composables/rules/rules.service'
import { useFormReferences } from '@/composables/useFormReferences'
import { useAppToast } from '@/composables/useAppToast'
import ConditionBuilder from '@/components/rules/ConditionBuilder.vue'
import FontAwesomeIconPicker from '@/components/forms/FontAwesomeIconPicker.vue'
import {
  emptyGroup,
  toConditions,
  fromConditions,
  hasValidLeaf,
  type PlayerOption,
} from '@/components/rules/condition-tree'
import { userApi } from '@/composables/user/user.api'
import { outcomeTypeApi } from '@/composables/outcome-type.api'
import { outcomeReasonApi } from '@/composables/outcome-reason.api'
import type { CatalogFact } from '@/composables/rules/rules.api'
import { NON_DETERMINISTIC_FACTS } from '@skol-arena/shared/types/index'
import type {
  BadgeAction,
  BadgeRecurrence,
  CreateRuleData,
  MessageAction,
  RuleAction,
  RuleConditions,
  TestRuleResult,
  OutcomeType,
  OutcomeReason,
} from '@skol-arena/shared/types/index'

const route = useRoute()
const router = useRouter()
const { t } = useI18n()
const toast = useAppToast()
const {
  catalog,
  currentRule,
  loading,
  error,
  loadCatalog,
  loadRuleById,
  createRule,
  updateRule,
  testRule,
} = useRulesService()
const { disciplineOptions, loadAll: loadReferences } = useFormReferences()

function minutesToTime(min: unknown): Time | undefined {
  return typeof min === 'number' ? new Time(Math.floor(min / 60), min % 60) : undefined
}
function timeToMinutes(time: Time | null | undefined): number | '' {
  return time ? time.hour * 60 + time.minute : ''
}
function stringToDate(value: unknown): DateValue | undefined {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? parseDate(value)
    : undefined
}
function formatMinutes(min: number): string {
  const h = Math.floor(min / 60)
  const m = min % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

const players = ref<PlayerOption[]>([])
async function loadPlayers() {
  try {
    const users = await userApi.list()
    players.value = users.map((u) => ({ id: u.id, displayName: u.displayName }))
  } catch {
    players.value = []
  }
}

// Shared by the condition builder and the simulator dialog, hence loaded here.
const outcomeTypes = ref<OutcomeType[]>([])
const outcomeReasons = ref<OutcomeReason[]>([])
async function loadOutcomes() {
  try {
    const [types, reasons] = await Promise.all([outcomeTypeApi.list(), outcomeReasonApi.list()])
    outcomeTypes.value = types
    outcomeReasons.value = reasons
  } catch {
    outcomeTypes.value = []
    outcomeReasons.value = []
  }
}

// Outcome names repeat across disciplines, so each option carries its parent.
const outcomeTypeOptions = computed(() =>
  outcomeTypes.value.map((o) => ({
    id: o.id,
    label: o.discipline ? `${o.name} (${o.discipline.name})` : o.name,
  })),
)
const outcomeReasonOptions = computed(() =>
  outcomeReasons.value.map((r) => ({
    id: r.id,
    label: r.outcomeType ? `${r.name} (${r.outcomeType.name})` : r.name,
  })),
)

const booleanOptions = [
  { label: t('rulesEngineFormView.boolTrue'), value: true },
  { label: t('rulesEngineFormView.boolFalse'), value: false },
]

/** Simulator inputs that pick from a list; null for free-form facts. */
function simulatorSelect(fact: CatalogFact) {
  const playerPlaceholder = t('rulesEngineFormView.placeholderPlayer')
  if (fact.ref === 'player') {
    const multiple = fact.type === 'stringList'
    return {
      items: players.value,
      valueKey: 'id',
      labelKey: 'displayName',
      multiple,
      placeholder: playerPlaceholder,
    }
  }
  if (fact.ref === 'outcomeType') {
    return {
      items: outcomeTypeOptions.value,
      valueKey: 'id',
      placeholder: t('conditionRow.placeholderOutcomeType'),
    }
  }
  if (fact.ref === 'outcomeReason') {
    return {
      items: outcomeReasonOptions.value,
      valueKey: 'id',
      placeholder: t('conditionRow.placeholderOutcomeReason'),
    }
  }
  if (fact.type === 'boolean') {
    return { items: booleanOptions, valueKey: 'value', searchInput: false }
  }
  return null
}

const ruleId = computed(() => route.params.id as string | undefined)
const isEdit = computed(() => !!ruleId.value)

const typeOptions = [
  { label: t('rulesEngineFormView.typeMessage'), value: 'message' },
  { label: t('rulesEngineFormView.typeBadge'), value: 'badge' },
]
const triggerOptions = [
  { label: t('rulesEngineFormView.triggerMatchSubmitted'), value: 'match_submitted' },
]
const scopeOptions = [
  { label: t('rulesEngineFormView.scopeGlobal'), value: 'global' },
  { label: t('common.discipline'), value: 'discipline' },
]
const recurrenceOptions = [
  { label: t('rulesEngineFormView.recurrencePerSeason'), value: 'per_season' },
  { label: t('rulesEngineFormView.recurrenceOnce'), value: 'once' },
]

const form = reactive<{
  name: string
  description: string
  type: 'message' | 'badge'
  triggerEvent: string
  scope: 'global' | 'discipline'
  disciplineId: string | null
  priority: number
  isActive: boolean
  conditions: RuleConditions
}>({
  name: '',
  description: '',
  type: 'message',
  triggerEvent: 'match_submitted',
  scope: 'global',
  disciplineId: null,
  priority: 0,
  isActive: true,
  conditions: toConditions(emptyGroup('all')),
})

const messageVariants = ref<string[]>([''])
const activeVariant = ref(0)
const badge = reactive<{
  icon: string
  label: string
  description: string
  recurrence: BadgeRecurrence
}>({
  icon: '',
  label: '',
  description: '',
  recurrence: 'per_season',
})

/**
 * Random facts are hidden on badge rules: badge awards are replayed by the
 * nightly reconciliation and must stay deterministic (backend rejects them too).
 */
const conditionFacts = computed(() =>
  form.type === 'badge'
    ? catalog.value.filter((f) => !(NON_DETERMINISTIC_FACTS as readonly string[]).includes(f.key))
    : catalog.value,
)

/** Sample rendering of a fact for the message preview. */
function sampleFor(fact: CatalogFact): string {
  if (fact.ref === 'player') {
    if (Array.isArray(fact.sample)) {
      const names = players.value.slice(0, 2).map((p) => p.displayName)
      return names.length ? names.join(', ') : t('rulesEngineFormView.previewPlayerFallback')
    }
    return players.value[0]?.displayName ?? t('rulesEngineFormView.previewPlayerFallback')
  }
  if (fact.ref === 'time') return formatMinutes(Number(fact.sample))
  return Array.isArray(fact.sample) ? fact.sample.join(', ') : String(fact.sample)
}

const preview = computed(() => {
  const variant = messageVariants.value[0]
  if (!variant) return ''
  return variant.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, key: string) => {
    const fact = catalog.value.find((f) => f.key === key)
    // Player-ref facts render a display name; preview with a sample player.
    return fact ? sampleFor(fact) : ''
  })
})

function insertVariable(key: string) {
  const idx = activeVariant.value
  messageVariants.value[idx] = (messageVariants.value[idx] ?? '') + `{{${key}}}`
}

function buildAction(): RuleAction {
  if (form.type === 'message') {
    return {
      type: 'message',
      variants: messageVariants.value.filter((v) => v.trim()),
    } as MessageAction
  }
  return {
    type: 'badge',
    icon: badge.icon,
    label: badge.label,
    description: badge.description,
    recurrence: badge.recurrence,
  } as BadgeAction
}

function validate(): string | null {
  if (!form.name.trim()) return t('rulesEngineFormView.validationNameRequired')
  if (form.scope === 'discipline' && !form.disciplineId)
    return t('rulesEngineFormView.validationDisciplineRequired')
  if (!hasValidLeaf(fromConditions(form.conditions)))
    return t('rulesEngineFormView.validationConditionRequired')
  if (form.type === 'message' && messageVariants.value.filter((v) => v.trim()).length === 0)
    return t('rulesEngineFormView.validationMessageRequired')
  if (form.type === 'badge' && (!badge.icon || !badge.label || !badge.description))
    return t('rulesEngineFormView.validationBadgeRequired')
  return null
}

async function handleSave() {
  const validationError = validate()
  if (validationError) {
    toast.add({
      severity: 'error',
      summary: t('rulesEngineFormView.validationSummary'),
      detail: validationError,
      life: 4000,
    })
    return
  }
  const payload: CreateRuleData = {
    name: form.name,
    description: form.description || null,
    type: form.type,
    triggerEvent: form.triggerEvent as 'match_submitted',
    scope: form.scope,
    disciplineId: form.scope === 'discipline' ? form.disciplineId : null,
    priority: form.priority,
    isActive: form.isActive,
    conditions: form.conditions,
    action: buildAction(),
  }
  const result = isEdit.value ? await updateRule(ruleId.value!, payload) : await createRule(payload)
  if (result) {
    toast.add({
      severity: 'success',
      summary: t('rulesEngineFormView.successSummary'),
      detail: isEdit.value
        ? t('rulesEngineFormView.ruleUpdated')
        : t('rulesEngineFormView.ruleCreated'),
      life: 3000,
    })
    router.push('/admin/rules-engine')
  }
}

// --- Test simulator ---
const testDialogVisible = ref(false)
const testContext = reactive<Record<string, unknown>>({})
const testResult = ref<TestRuleResult | null>(null)

function openTest() {
  testResult.value = null
  for (const fact of catalog.value)
    testContext[fact.key] = Array.isArray(fact.sample) ? [...fact.sample] : fact.sample
  testDialogVisible.value = true
}

async function runTest() {
  testResult.value = await testRule(form.triggerEvent, form.conditions, buildAction(), {
    ...testContext,
  })
}

onMounted(async () => {
  await Promise.all([
    loadCatalog(form.triggerEvent),
    loadReferences(),
    loadPlayers(),
    loadOutcomes(),
  ])
  if (isEdit.value) {
    await loadRuleById(ruleId.value!)
    hydrate()
  }
})

function hydrate() {
  const rule = currentRule.value
  if (!rule) return
  form.name = rule.name
  form.description = rule.description ?? ''
  form.type = rule.type
  form.triggerEvent = rule.triggerEvent
  form.scope = rule.scope
  form.disciplineId = rule.disciplineId
  form.priority = rule.priority
  form.isActive = rule.isActive
  form.conditions = rule.conditions
  if (rule.action.type === 'message') {
    messageVariants.value = rule.action.variants.length ? [...rule.action.variants] : ['']
  } else {
    badge.icon = rule.action.icon
    badge.label = rule.action.label
    badge.description = rule.action.description
    // Rules stored before the seasonal badges change carry no recurrence; the
    // backend patch chain stamps them, but an unsaved draft can still reach here.
    badge.recurrence = rule.action.recurrence ?? 'per_season'
  }
}
</script>
