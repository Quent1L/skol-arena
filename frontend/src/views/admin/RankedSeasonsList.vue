<template>
  <div class="ranked-seasons-list p-4">
    <div class="flex justify-between items-center mb-4">
      <h1 class="text-2xl font-bold">{{ t('rankedSeasonsList.title') }}</h1>
      <Button
        :label="t('rankedSeasonsList.newSeason')"
        icon="fa fa-plus"
        @click="router.push('/admin/ranked/new')"
      />
    </div>

    <Message v-if="error" severity="error" :closable="true">
      {{ error }}
    </Message>

    <DataTable
      :value="seasons"
      :loading="loading"
      striped-rows
      paginator
      :rows="10"
      :rows-per-page-options="[5, 10, 20, 50]"
      responsive-layout="scroll"
      class="p-datatable-sm"
    >
      <Column field="name" :header="t('common.name')" sortable>
        <template #body="{ data }">
          <span class="font-semibold">{{ data.name }}</span>
        </template>
      </Column>

      <Column field="discipline.name" :header="t('common.discipline')" sortable />

      <Column field="status" :header="t('common.status')" sortable>
        <template #body="{ data }">
          <Tag :severity="statusSeverity(data.status)" :value="statusLabel(data.status)" />
        </template>
      </Column>

      <Column field="startDate" :header="t('rankedSeasonsList.colStart')" sortable>
        <template #body="{ data }">
          {{ formatDate(data.startDate) }}
        </template>
      </Column>

      <Column field="endDate" :header="t('rankedSeasonsList.colEnd')" sortable>
        <template #body="{ data }">
          {{ formatDate(data.endDate) }}
        </template>
      </Column>

      <Column :header="t('rankedSeasonsList.colChaining')">
        <template #body="{ data }">
          <Tag
            v-if="data.automation?.enabled"
            severity="info"
            :value="chainingLabel(data)"
            v-tooltip.top="t('rankedSeasonsList.tooltipChaining')"
          />
          <span v-else class="text-surface-400">—</span>
        </template>
      </Column>

      <Column :header="t('common.actions')" style="width: 14rem">
        <template #body="{ data }">
          <div class="flex gap-2">
            <Button
              icon="fa fa-eye"
              size="small"
              text
              rounded
              @click="router.push(`/tournaments/${data.id}`)"
              v-tooltip.top="t('rankedSeasonsList.tooltipView')"
            />
            <Button
              v-if="data.status !== 'draft'"
              icon="fa fa-trophy"
              size="small"
              text
              rounded
              @click="router.push(`/admin/ranked/${data.id}/tiers`)"
              v-tooltip.top="t('rankedSeasonsList.tooltipManageRanks')"
            />
            <!-- A running season is no longer frozen: its metadata is always
                 editable and its MMR settings replay the season when changed.
                 Only a finished one is closed for good. -->
            <Button
              v-if="data.status !== 'finished'"
              icon="fa fa-edit"
              size="small"
              text
              rounded
              @click="router.push(`/admin/ranked/${data.id}/edit`)"
              v-tooltip.top="t('common.edit')"
            />
            <Button
              v-if="data.status === 'draft'"
              icon="fa fa-play"
              size="small"
              text
              rounded
              severity="success"
              @click="handleStart(data)"
              v-tooltip.top="t('rankedSeasonsList.tooltipStart')"
            />
            <Button
              v-if="data.status === 'ongoing'"
              icon="fa fa-stop"
              size="small"
              text
              rounded
              severity="danger"
              @click="confirmEnd(data)"
              v-tooltip.top="t('rankedSeasonsList.tooltipEnd')"
            />
            <Button
              v-if="data.status === 'ongoing' && data.automation?.enabled"
              icon="fa fa-forward"
              size="small"
              text
              rounded
              severity="warn"
              @click="confirmRollover(data)"
              v-tooltip.top="t('rankedSeasonsList.tooltipRollover')"
            />
            <Button
              v-if="data.status === 'finished'"
              icon="fa fa-film"
              size="small"
              text
              rounded
              :loading="regeneratingId === data.id"
              @click="handleRegenerateRewind(data)"
              v-tooltip.top="t('rankedSeasonsList.tooltipRegenerateRewind')"
            />
          </div>
        </template>
      </Column>

      <template #empty>
        <div class="text-center py-8">
          <p class="text-gray-500 mb-4">{{ t('rankedSeasonsList.empty') }}</p>
          <Button
            :label="t('rankedSeasonsList.createSeason')"
            icon="fa fa-plus"
            @click="router.push('/admin/ranked/new')"
          />
        </div>
      </template>
    </DataTable>

    <Dialog
      v-model:visible="endDialogVisible"
      :header="t('rankedSeasonsList.endDialogHeader')"
      :modal="true"
      :style="{ width: '450px' }"
    >
      <div class="flex items-center gap-3 mb-4">
        <i class="pi pi-exclamation-triangle text-3xl text-orange-500"></i>
        <span>{{ t('rankedSeasonsList.endDialogConfirm', { name: seasonToEnd?.name }) }}</span>
      </div>
      <template #footer>
        <Button :label="t('common.cancel')" icon="pi pi-times" @click="endDialogVisible = false" text />
        <Button
          :label="t('rankedSeasonsList.end')"
          icon="pi pi-check"
          @click="handleEnd"
          severity="danger"
          :loading="loading"
        />
      </template>
    </Dialog>

    <Dialog
      v-model:visible="rolloverDialogVisible"
      :header="t('rankedSeasonsList.rolloverDialogHeader')"
      :modal="true"
      :style="{ width: '480px' }"
    >
      <div class="flex items-start gap-3 mb-4">
        <i class="pi pi-exclamation-triangle text-3xl text-orange-500"></i>
        <div>
          <p>{{ t('rankedSeasonsList.rolloverDialogConfirm', { name: seasonToRollover?.name }) }}</p>
          <p class="text-sm text-surface-400 mt-2">
            {{ t('rankedSeasonsList.rolloverDialogDetail') }}
          </p>
        </div>
      </div>
      <template #footer>
        <Button
          :label="t('common.cancel')"
          icon="pi pi-times"
          @click="rolloverDialogVisible = false"
          text
        />
        <Button
          :label="t('rankedSeasonsList.rollover')"
          icon="pi pi-check"
          @click="handleRollover"
          severity="warn"
          :loading="loading"
        />
      </template>
    </Dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useRankedService } from '@/composables/ranked/ranked.service'
import { rewindApi } from '@/composables/ranked/rewind.api'
import { useAppToast } from '@/composables/useAppToast'
import type { RankedSeason } from '@/composables/ranked/ranked.api'

const router = useRouter()
const { t } = useI18n()
const toast = useAppToast()
const { seasons, loading, error, loadSeasons, startSeason, endSeason, rolloverNow } =
  useRankedService()

const endDialogVisible = ref(false)
const seasonToEnd = ref<RankedSeason | null>(null)
const rolloverDialogVisible = ref(false)
const seasonToRollover = ref<RankedSeason | null>(null)
const regeneratingId = ref<string | null>(null)

function formatDate(date: string) {
  return new Date(date).toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}

/** "Auto · 12/04/2026" while a term is scheduled, plain "Auto" on a draft that has none yet. */
function chainingLabel(season: RankedSeason) {
  const at = season.automation?.nextRolloverAt
  return at
    ? t('rankedSeasonsList.chainingNext', { date: formatDate(at) })
    : t('rankedSeasonsList.chainingOn')
}

function statusLabel(status: string) {
  const labels: Record<string, string> = {
    draft: t('rankedSeasonsList.statusDraft'),
    open: t('rankedSeasonsList.statusOpen'),
    ongoing: t('rankedSeasonsList.statusOngoing'),
    finished: t('rankedSeasonsList.statusFinished'),
    cancelled: t('rankedSeasonsList.statusCancelled'),
  }
  return labels[status] ?? status
}

function statusSeverity(status: string) {
  const severities: Record<string, string> = {
    draft: 'secondary',
    open: 'info',
    ongoing: 'success',
    finished: 'contrast',
    cancelled: 'danger',
  }
  return severities[status] ?? 'secondary'
}

async function handleStart(season: RankedSeason) {
  await startSeason(season.id)
  await loadSeasons()
}

function confirmEnd(season: RankedSeason) {
  seasonToEnd.value = season
  endDialogVisible.value = true
}

/**
 * Queues a rebuild of the season rewind. Only useful after the underlying data
 * moved (an MMR recalculation, a cancelled match); players keep their promotion
 * window and their viewed state across a rebuild.
 */
async function handleRegenerateRewind(season: RankedSeason) {
  regeneratingId.value = season.id
  try {
    await rewindApi.regenerate(season.id)
    toast.add({
      severity: 'success',
      summary: t('rankedSeasonsList.rewindQueued'),
      detail: t('rankedSeasonsList.rewindQueuedDetail'),
      life: 4000,
    })
  } catch (err) {
    // The backend refuses a rebuild for a reason the admin needs to read
    // (a frozen payload version, missing rights): the interceptor already
    // carries the translated message, so surface it rather than drop it.
    toast.add({
      severity: 'error',
      summary: t('common.error'),
      detail:
        err instanceof Error ? err.message : t('rankedSeasonsList.rewindFailedDetail'),
      life: 6000,
    })
  } finally {
    regeneratingId.value = null
  }
}

function confirmRollover(season: RankedSeason) {
  seasonToRollover.value = season
  rolloverDialogVisible.value = true
}

async function handleRollover() {
  if (!seasonToRollover.value) return
  const next = await rolloverNow(seasonToRollover.value.id)
  if (!next) {
    toast.add({
      severity: 'error',
      summary: t('common.error'),
      detail: error.value ?? t('rankedSeasonsList.rolloverFailedDetail'),
      life: 6000,
    })
    return
  }
  rolloverDialogVisible.value = false
  seasonToRollover.value = null
  toast.add({
    severity: 'success',
    summary: t('rankedSeasonsList.rolloverDone'),
    detail: t('rankedSeasonsList.rolloverDoneDetail', { name: next.name }),
    life: 5000,
  })
  await loadSeasons()
}

async function handleEnd() {
  if (!seasonToEnd.value) return
  const success = await endSeason(seasonToEnd.value.id)
  if (success) {
    endDialogVisible.value = false
    seasonToEnd.value = null
    await loadSeasons()
  }
}

onMounted(() => {
  loadSeasons()
})
</script>

<style scoped>
.ranked-seasons-list {
  max-width: 1400px;
  margin: 0 auto;
}
</style>
