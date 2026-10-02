<template>
  <div class="rules-engine-form p-4">
    <div class="flex items-center gap-3 mb-4">
      <Button icon="fa fa-arrow-left" text rounded @click="router.push('/admin/rules-engine')" />
      <h1 class="text-2xl font-bold">{{ isEdit ? t('rulesEngineFormView.editTitle') : t('rulesEngineFormView.newTitle') }}</h1>
      <Tag :value="t('rulesEngineFormView.betaTag')" severity="warn" />
    </div>

    <Message severity="warn" :closable="false" class="mb-3">
      <i class="fa fa-triangle-exclamation mr-2" />{{ t('rulesEngineFormView.betaWarning') }}
    </Message>

    <!-- The patch chain gave up on this rule and deactivated it. Saving clears the
         flag, but only the condition below can actually be saved once fixed: the
         builder no longer offers the retired variable. -->
    <Message v-if="currentRule?.disabledReason" severity="error" :closable="false" class="mb-3">
      <p class="font-semibold">{{ t('rulesEngineFormView.migrationDisabledTitle') }}</p>
      <p class="text-sm mt-1">{{ t('rulesEngineFormView.migrationDisabledHelp') }}</p>
      <p class="text-sm mt-2 font-mono">{{ currentRule.disabledReason }}</p>
    </Message>

    <Message v-if="error" severity="error" :closable="true">{{ error }}</Message>

    <div class="grid grid-cols-1 xl:grid-cols-[320px_1fr_360px] gap-4">
      <!-- Left panel: metadata -->
      <Card>
        <template #title>{{ t('rulesEngineFormView.metadataTitle') }}</template>
        <template #content>
          <div class="flex flex-col gap-4">
            <div>
              <label class="block mb-1 text-sm font-medium">{{ t('rulesEngineFormView.labelName') }}</label>
              <InputText v-model="form.name" class="w-full" />
            </div>
            <div>
              <label class="block mb-1 text-sm font-medium">{{ t('rulesEngineFormView.labelDescription') }}</label>
              <Textarea v-model="form.description" class="w-full" rows="2" auto-resize />
            </div>
            <div>
              <label class="block mb-1 text-sm font-medium">{{ t('rulesEngineFormView.labelType') }}</label>
              <SelectButton
                v-model="form.type"
                :options="typeOptions"
                option-label="label"
                option-value="value"
                :allow-empty="false"
              />
            </div>
            <div>
              <label class="block mb-1 text-sm font-medium">{{ t('rulesEngineFormView.labelTriggerEvent') }}</label>
              <Select
                v-model="form.triggerEvent"
                :options="triggerOptions"
                option-label="label"
                option-value="value"
                class="w-full"
                @change="loadCatalog(form.triggerEvent)"
              />
            </div>
            <div>
              <label class="block mb-1 text-sm font-medium">{{ t('rulesEngineFormView.labelScope') }}</label>
              <SelectButton
                v-model="form.scope"
                :options="scopeOptions"
                option-label="label"
                option-value="value"
                :allow-empty="false"
              />
            </div>
            <div v-if="form.scope === 'discipline'">
              <label class="block mb-1 text-sm font-medium">{{ t('common.discipline') }}</label>
              <Select
                v-model="form.disciplineId"
                :options="disciplineOptions"
                option-label="label"
                option-value="value"
                class="w-full"
                :placeholder="t('rulesEngineFormView.placeholderDiscipline')"
              />
            </div>
            <!-- Priority only arbitrates between message rules: every matching badge
                 rule awards its badge, so the field would be inoperative there. -->
            <div v-if="form.type === 'message'">
              <label class="block mb-1 text-sm font-medium">{{ t('rulesEngineFormView.labelPriority') }}</label>
              <InputNumber v-model="form.priority" class="w-full" show-buttons />
              <p class="text-xs text-surface-500 mt-1">{{ t('rulesEngineFormView.hintPriority') }}</p>
            </div>
            <div class="flex items-center gap-2">
              <Checkbox v-model="form.isActive" :binary="true" input-id="isActive" />
              <label for="isActive" class="text-sm">{{ t('rulesEngineFormView.labelIsActive') }}</label>
            </div>
          </div>
        </template>
      </Card>

      <!-- Panneau central: conditions -->
      <Card>
        <template #title>{{ t('rulesEngineFormView.conditionsTitle') }}</template>
        <template #content>
          <ConditionBuilder
            v-model="form.conditions"
            :facts="conditionFacts"
            :players="players"
            :outcome-types="outcomeTypes"
            :outcome-reasons="outcomeReasons"
            :discipline-id="form.scope === 'discipline' ? form.disciplineId : null"
          />
        </template>
      </Card>

      <!-- Panneau droit: action -->
      <Card>
        <template #title>{{ form.type === 'badge' ? t('rulesEngineFormView.typeBadge') : t('rulesEngineFormView.typeMessage') }}</template>
        <template #content>
          <!-- MESSAGE -->
          <div v-if="form.type === 'message'" class="flex flex-col gap-3">
            <div v-for="(variant, idx) in messageVariants" :key="idx" class="flex gap-2 items-start">
              <Textarea
                :model-value="variant"
                rows="2"
                auto-resize
                class="flex-1"
                @focus="activeVariant = idx"
                @update:model-value="messageVariants[idx] = $event"
              />
              <Button
                v-if="messageVariants.length > 1"
                icon="fa fa-trash"
                text
                rounded
                severity="danger"
                size="small"
                @click="messageVariants.splice(idx, 1)"
              />
            </div>
            <Button :label="t('rulesEngineFormView.addVariant')" icon="fa fa-plus" text size="small" @click="messageVariants.push('')" />

            <div>
              <p class="text-xs font-semibold text-surface-500 mb-1">{{ t('rulesEngineFormView.variablesLabel') }}</p>
              <div class="flex flex-wrap gap-1">
                <Tag
                  v-for="fact in catalog"
                  :key="fact.key"
                  :value="`{{${fact.key}}}`"
                  class="cursor-pointer"
                  severity="secondary"
                  @click="insertVariable(fact.key)"
                />
              </div>
            </div>

            <div class="bg-surface-100 dark:bg-surface-800 rounded p-3">
              <p class="text-xs font-semibold text-surface-500 mb-1">{{ t('rulesEngineFormView.previewLabel') }}</p>
              <p class="text-sm">{{ preview || '—' }}</p>
            </div>
          </div>

          <!-- BADGE -->
          <div v-else class="flex flex-col gap-3">
            <div>
              <label class="block mb-1 text-sm font-medium">{{ t('rulesEngineFormView.labelIcon') }}</label>
              <FontAwesomeIconPicker v-model="badge.icon" />
            </div>
            <div>
              <label class="block mb-1 text-sm font-medium">{{ t('rulesEngineFormView.labelBadgeLabel') }}</label>
              <InputText v-model="badge.label" class="w-full" :placeholder="t('rulesEngineFormView.placeholderBadgeLabel')" />
            </div>
            <div>
              <label class="block mb-1 text-sm font-medium">{{ t('rulesEngineFormView.labelBadgeDescription') }}</label>
              <Textarea v-model="badge.description" rows="2" auto-resize class="w-full" :placeholder="t('rulesEngineFormView.placeholderBadgeDescription')" />
            </div>
            <div>
              <label class="block mb-1 text-sm font-medium">{{ t('rulesEngineFormView.labelBadgeRecurrence') }}</label>
              <SelectButton
                v-model="badge.recurrence"
                :options="recurrenceOptions"
                option-label="label"
                option-value="value"
                :allow-empty="false"
              />
              <p class="text-xs text-surface-500 mt-1">
                {{
                  badge.recurrence === 'per_season'
                    ? t('rulesEngineFormView.helpRecurrencePerSeason')
                    : t('rulesEngineFormView.helpRecurrenceOnce')
                }}
              </p>
            </div>
          </div>
        </template>
      </Card>
    </div>

    <div class="flex justify-end gap-2 mt-4">
      <Button :label="t('rulesEngineFormView.testButton')" icon="fa fa-flask" severity="secondary" outlined @click="openTest" />
      <Button :label="t('common.cancel')" text @click="router.push('/admin/rules-engine')" />
      <Button :label="t('rulesEngineFormView.saveButton')" icon="fa fa-save" :loading="loading" @click="handleSave" />
    </div>

    <!-- Dialog de test -->
    <Dialog v-model:visible="testDialogVisible" :header="t('rulesEngineFormView.testDialogTitle')" :modal="true" :style="{ width: '600px' }">
      <div class="grid grid-cols-2 gap-3">
        <div v-for="fact in catalog" :key="fact.key">
          <label class="block text-xs font-medium mb-1">{{ fact.label }}</label>
          <MultiSelect
            v-if="fact.ref === 'player' && fact.type === 'stringList'"
            v-model="testContext[fact.key]"
            :options="players"
            option-label="displayName"
            option-value="id"
            :placeholder="t('rulesEngineFormView.placeholderPlayer')"
            filter
            filter-match-mode="accentInsensitive"
            display="chip"
            class="w-full"
          />
          <Select
            v-else-if="fact.ref === 'player'"
            v-model="testContext[fact.key]"
            :options="players"
            option-label="displayName"
            option-value="id"
            :placeholder="t('rulesEngineFormView.placeholderPlayer')"
            filter
            filter-match-mode="accentInsensitive"
            class="w-full"
          />
          <DatePicker
            v-else-if="fact.ref === 'time'"
            :model-value="minutesToDate(testContext[fact.key] as number)"
            time-only
            hour-format="24"
            class="w-full"
            @update:model-value="testContext[fact.key] = dateToMinutes($event as Date | null)"
          />
          <Select
            v-else-if="fact.ref === 'outcomeType'"
            v-model="testContext[fact.key]"
            :options="outcomeTypeOptions"
            option-label="label"
            option-value="id"
            :placeholder="t('conditionRow.placeholderOutcomeType')"
            filter
            class="w-full"
          />
          <Select
            v-else-if="fact.ref === 'outcomeReason'"
            v-model="testContext[fact.key]"
            :options="outcomeReasonOptions"
            option-label="label"
            option-value="id"
            :placeholder="t('conditionRow.placeholderOutcomeReason')"
            filter
            class="w-full"
          />
          <InputNumber v-else-if="fact.type === 'number'" v-model="testContext[fact.key] as number" class="w-full" />
          <Select
            v-else-if="fact.type === 'boolean'"
            v-model="testContext[fact.key]"
            :options="[{ label: t('rulesEngineFormView.boolTrue'), value: true }, { label: t('rulesEngineFormView.boolFalse'), value: false }]"
            option-label="label"
            option-value="value"
            class="w-full"
          />
          <InputText v-else v-model="testContext[fact.key] as string" class="w-full" />
        </div>
      </div>
      <div v-if="testResult" class="mt-4 p-3 rounded" :class="testResult.matched ? 'bg-green-100 dark:bg-green-900' : 'bg-surface-100 dark:bg-surface-800'">
        <p class="font-semibold">{{ testResult.matched ? t('rulesEngineFormView.testMatched') : t('rulesEngineFormView.testNotMatched') }}</p>
        <p v-if="testResult.output?.type === 'message'" class="text-sm mt-1">{{ testResult.output.message }}</p>
        <p v-else-if="testResult.output?.type === 'badge'" class="text-sm mt-1">
          <i :class="testResult.output.badge.icon"></i> {{ testResult.output.badge.label }} — {{ testResult.output.badge.description }}
        </p>
      </div>
      <template #footer>
        <Button :label="t('rulesEngineFormView.closeButton')" text @click="testDialogVisible = false" />
        <Button :label="t('rulesEngineFormView.runTestButton')" icon="fa fa-play" @click="runTest" />
      </template>
    </Dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useRulesService } from '@/composables/rules/rules.service'
import { useFormReferences } from '@/composables/useFormReferences'
import { useAppToast } from '@/composables/useAppToast'
import ConditionBuilder from '@/components/rules/ConditionBuilder.vue'
import FontAwesomeIconPicker from '@/components/forms/FontAwesomeIconPicker.vue'
import { emptyGroup, toConditions, fromConditions, hasValidLeaf, type PlayerOption } from '@/components/rules/condition-tree'
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
const { catalog, currentRule, loading, error, loadCatalog, loadRuleById, createRule, updateRule, testRule } =
  useRulesService()
const { disciplineOptions, loadAll: loadReferences } = useFormReferences()

function minutesToDate(min: number | null | undefined): Date | null {
  if (typeof min !== 'number') return null
  const d = new Date()
  d.setHours(Math.floor(min / 60), min % 60, 0, 0)
  return d
}
function dateToMinutes(d: Date | null): number | '' {
  return d ? d.getHours() * 60 + d.getMinutes() : ''
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
  outcomeTypes.value.map((o) => ({ id: o.id, label: o.discipline ? `${o.name} (${o.discipline.name})` : o.name })),
)
const outcomeReasonOptions = computed(() =>
  outcomeReasons.value.map((r) => ({ id: r.id, label: r.outcomeType ? `${r.name} (${r.outcomeType.name})` : r.name })),
)

const ruleId = computed(() => route.params.id as string | undefined)
const isEdit = computed(() => !!ruleId.value)

const typeOptions = [
  { label: t('rulesEngineFormView.typeMessage'), value: 'message' },
  { label: t('rulesEngineFormView.typeBadge'), value: 'badge' },
]
const triggerOptions = [{ label: t('rulesEngineFormView.triggerMatchSubmitted'), value: 'match_submitted' }]
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
const badge = reactive<{ icon: string; label: string; description: string; recurrence: BadgeRecurrence }>({
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
    return { type: 'message', variants: messageVariants.value.filter((v) => v.trim()) } as MessageAction
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
  if (form.scope === 'discipline' && !form.disciplineId) return t('rulesEngineFormView.validationDisciplineRequired')
  if (!hasValidLeaf(fromConditions(form.conditions))) return t('rulesEngineFormView.validationConditionRequired')
  if (form.type === 'message' && messageVariants.value.filter((v) => v.trim()).length === 0)
    return t('rulesEngineFormView.validationMessageRequired')
  if (form.type === 'badge' && (!badge.icon || !badge.label || !badge.description))
    return t('rulesEngineFormView.validationBadgeRequired')
  return null
}

async function handleSave() {
  const validationError = validate()
  if (validationError) {
    toast.add({ severity: 'error', summary: t('rulesEngineFormView.validationSummary'), detail: validationError, life: 4000 })
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
      detail: isEdit.value ? t('rulesEngineFormView.ruleUpdated') : t('rulesEngineFormView.ruleCreated'),
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
  for (const fact of catalog.value) testContext[fact.key] = Array.isArray(fact.sample) ? [...fact.sample] : fact.sample
  testDialogVisible.value = true
}

async function runTest() {
  testResult.value = await testRule(form.triggerEvent, form.conditions, buildAction(), { ...testContext })
}

onMounted(async () => {
  await Promise.all([loadCatalog(form.triggerEvent), loadReferences(), loadPlayers(), loadOutcomes()])
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

<style scoped>
.rules-engine-form {
  max-width: 1600px;
  margin: 0 auto;
}
</style>
