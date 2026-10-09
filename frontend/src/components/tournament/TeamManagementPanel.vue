<template>
  <div class="p-4 space-y-4">
    <UAlert v-if="isLocked" color="warning" variant="subtle" :title="t('teamManagementPanel.teamsLocked')" />

    <UAlert
      v-if="!isLocked && props.isParticipant && isAlreadyInTeam"
      color="info"
      variant="subtle"
      :title="t('teamManagementPanel.alreadyInTeam')"
    />

    <!-- Create team form -->
    <div v-if="canCreate && !isLocked" class="flex gap-2">
      <UInput
        v-model="newTeamName"
        :placeholder="t('teamManagementPanel.teamNamePlaceholder')"
        size="xl"
        class="flex-1 min-w-0"
        maxlength="50"
        @keyup.enter="handleCreate"
      />
      <UButton
        :label="t('common.create')"
        icon="i-fa7-solid:plus"
        size="xl"
        class="shrink-0"
        :loading="loading"
        :disabled="!newTeamName.trim()"
        @click="handleCreate"
      />
    </div>

    <div v-if="loading && !teams.length" class="flex justify-center py-8">
      <UIcon name="i-lucide-loader-circle" class="size-10 animate-spin text-muted" />
    </div>

    <div v-else-if="!teams.length" class="text-center py-8 text-gray-500 dark:text-gray-400">
      {{ t('teamManagementPanel.noTeams') }}
    </div>

    <div v-else class="space-y-3">
      <UCard v-for="team in teams" :key="team.id" variant="soft">
        <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div class="min-w-0 flex-1">
            <div class="flex items-center gap-2 mb-2">
              <span class="font-semibold text-gray-900 dark:text-gray-100">{{ team.name }}</span>
              <UBadge :label="team.members.length" color="info" size="sm" />
              <i
                v-if="team.hasMatch"
                class="fa fa-lock text-xs text-gray-400"
                :title="t('teamManagementPanel.teamLockedTitle')"
              />
            </div>
            <div class="flex flex-wrap gap-1">
              <UBadge
                v-for="member in team.members"
                :key="member.id"
                :label="member.user.displayName"
                color="neutral"
                variant="soft"
              />
              <span v-if="!team.members.length" class="text-xs text-gray-400 italic">{{
                t('teamManagementPanel.noMembers')
              }}</span>
            </div>
          </div>
          <div class="flex flex-wrap gap-1 shrink-0">
            <!-- Admin: add player button -->
            <UButton
              v-if="props.canManage && !isTeamLocked(team)"
              icon="i-fa7-solid:user-plus"
              color="info"
              variant="outline"
              :aria-label="t('teamManagementPanel.addPlayerTitle')"
              :loading="loading"
              @click="openAddPlayerDialog(team)"
            />
            <UButton
              v-if="canJoinTeam(team) && !isTeamLocked(team)"
              :label="t('teamManagementPanel.joinButton')"
              icon="i-fa7-solid:right-to-bracket"
              color="success"
              variant="outline"
              :loading="loading"
              @click="handleJoin(team.id)"
            />
            <UButton
              v-if="isMemberOf(team) && !isTeamLocked(team)"
              :label="t('teamManagementPanel.leaveButton')"
              icon="i-fa7-solid:right-from-bracket"
              color="warning"
              variant="outline"
              :loading="loading"
              @click="handleLeave(team.id)"
            />
            <UButton
              v-if="canDelete(team)"
              icon="i-fa7-solid:trash"
              color="error"
              variant="outline"
              :aria-label="t('common.delete')"
              :loading="loading"
              @click="handleDelete(team.id)"
            />
          </div>
        </div>
      </UCard>
    </div>

    <!-- Admin: add player dialog -->
    <UModal
      v-model:open="addPlayerDialogVisible"
      :title="t('teamManagementPanel.addPlayerTitle')"
      :ui="{ content: 'sm:max-w-sm', footer: 'justify-end' }"
    >
      <template #body>
        <div class="flex flex-col gap-4">
          <span class="text-sm text-gray-500 dark:text-gray-400">
            {{ t('teamManagementPanel.addPlayerDescription') }}
            <strong>{{ targetTeam?.name }}</strong
            >.
          </span>
          <USelectMenu
            v-model="selectedUserId"
            :items="availableParticipants"
            value-key="value"
            :placeholder="t('teamManagementPanel.choosePlayerPlaceholder')"
            size="xl"
            class="w-full"
          />
        </div>
      </template>
      <template #footer>
        <UButton
          :label="t('common.cancel')"
          color="neutral"
          variant="outline"
          @click="addPlayerDialogVisible = false"
        />
        <UButton
          :label="t('teamManagementPanel.addButton')"
          icon="i-fa7-solid:user-plus"
          :disabled="!selectedUserId"
          :loading="loading"
          @click="handleAdminAddPlayer"
        />
      </template>
    </UModal>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useTeamService } from '@/composables/team/team.service'
import { participantApi } from '@/composables/participant.api'
import { onWsEvent, sendWsMessage } from '@/composables/notification/notification.socket'
import type { ClientTeam } from '@skol-arena/shared/types/index'
import type { ParticipantListItem } from '@skol-arena/shared/types/index'

const props = defineProps<{
  tournamentId: string
  currentUserId?: string
  isParticipant: boolean
  canManage: boolean
  tournamentStatus?: string
}>()

const { t } = useI18n()

const { teams, loading, loadTeams, createTeam, joinTeam, leaveTeam, deleteTeam } = useTeamService()
const newTeamName = ref('')

const isLocked = computed(
  () => props.tournamentStatus === 'ongoing' || props.tournamentStatus === 'finished',
)

const isAlreadyInTeam = computed(() => !props.canManage && userCurrentTeamId.value !== null)
const canCreate = computed(() => props.canManage || (props.isParticipant && !isAlreadyInTeam.value))

const userCurrentTeamId = computed(() => {
  if (!props.currentUserId) return null
  const team = teams.value.find((t) => t.members.some((m) => m.userId === props.currentUserId))
  return team?.id ?? null
})

// Add player dialog state
const addPlayerDialogVisible = ref(false)
const targetTeam = ref<ClientTeam | null>(null)
const selectedUserId = ref<string | null>(null)
const participants = ref<ParticipantListItem[]>([])

const availableParticipants = computed(() => {
  if (!targetTeam.value) return []
  const memberIds = new Set(targetTeam.value.members.map((m) => m.userId))
  return participants.value
    .filter((p) => !memberIds.has(p.userId))
    .map((p) => ({ label: p.user.displayName, value: p.userId }))
})

function openAddPlayerDialog(team: ClientTeam) {
  targetTeam.value = team
  selectedUserId.value = null
  addPlayerDialogVisible.value = true
}

async function handleAdminAddPlayer() {
  if (!targetTeam.value || !selectedUserId.value) return
  await joinTeam(props.tournamentId, targetTeam.value.id, selectedUserId.value)
  addPlayerDialogVisible.value = false
}

function isMemberOf(team: ClientTeam): boolean {
  if (!props.currentUserId) return false
  return team.members.some((m) => m.userId === props.currentUserId)
}

function canJoinTeam(team: ClientTeam): boolean {
  if (!props.currentUserId) return false
  if (!props.isParticipant && !props.canManage) return false
  if (userCurrentTeamId.value !== null) return false
  return !isMemberOf(team)
}

function isTeamLocked(team: ClientTeam): boolean {
  return isLocked.value || team.hasMatch
}

function canDelete(team: ClientTeam): boolean {
  if (isLocked.value) return false
  // Hide delete if user is the sole member (leave auto-deletes)
  if (isMemberOf(team) && team.members.length === 1) return false
  if (!props.currentUserId) return false
  return props.canManage || team.createdBy === props.currentUserId
}

async function handleCreate() {
  if (!newTeamName.value.trim()) return
  await createTeam(props.tournamentId, newTeamName.value.trim())
  newTeamName.value = ''
}

async function handleJoin(teamId: string) {
  await joinTeam(props.tournamentId, teamId)
}

async function handleLeave(teamId: string) {
  await leaveTeam(props.tournamentId, teamId)
}

async function handleDelete(teamId: string) {
  await deleteTeam(props.tournamentId, teamId)
}

const offCreated = ref<(() => void) | null>(null)
const offUpdated = ref<(() => void) | null>(null)
const offDeleted = ref<(() => void) | null>(null)

onMounted(async () => {
  await loadTeams(props.tournamentId)

  if (props.canManage) {
    participants.value = await participantApi.getTournamentParticipants(props.tournamentId)
  }

  sendWsMessage({ event: 'subscribe_tournament', tournamentId: props.tournamentId })

  offCreated.value = onWsEvent('team_created', (data) => {
    const team = data as ClientTeam
    if (!teams.value.find((t) => t.id === team.id)) {
      teams.value.push(team)
    }
  })

  offUpdated.value = onWsEvent('team_updated', (data) => {
    const team = data as ClientTeam
    const idx = teams.value.findIndex((t) => t.id === team.id)
    if (idx !== -1) teams.value[idx] = team
  })

  offDeleted.value = onWsEvent('team_deleted', (data) => {
    const { teamId } = data as { teamId: string }
    teams.value = teams.value.filter((t) => t.id !== teamId)
  })
})

onUnmounted(() => {
  sendWsMessage({ event: 'unsubscribe_tournament', tournamentId: props.tournamentId })
  offCreated.value?.()
  offUpdated.value?.()
  offDeleted.value?.()
})
</script>
