<template>
  <div>
    <div v-if="canAddParticipants" class="mb-4 flex justify-end">
      <UButton
        :label="t('tournamentParticipantsList.addParticipant')"
        icon="i-fa7-solid:user-plus"
        @click="showAddParticipantDialog = true"
      />
    </div>

    <div v-if="loading" class="flex justify-center py-8">
      <UIcon name="i-lucide-loader-circle" class="size-10 animate-spin text-muted" />
    </div>

    <div
      v-else-if="participants.length > 0"
      class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4"
    >
      <div
        v-for="participant in participants"
        :key="participant.id"
        class="flex items-center gap-3 p-4 bg-gray-50 dark:bg-gray-800 rounded-lg"
      >
        <RouterLink
          :to="{ path: `/players/${participant.userId}`, query: { tournamentId: props.tournamentId } }"
          class="flex items-center gap-3 flex-1 min-w-0 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors no-underline rounded-lg"
        >
          <PlayerAvatar
            :name="participant.user.displayName"
            :player-id="participant.userId"
            size="md"
            shape="square"
          />
          <div class="flex-1 min-w-0">
            <div class="font-medium text-blue-600 dark:text-blue-400 hover:underline truncate">
              {{ participant.user.displayName }}
            </div>
            <div class="text-sm text-gray-500 dark:text-gray-400">
              {{ t('tournamentParticipantsList.registeredOn', { date: formatDate(participant.joinedAt) }) }}
            </div>
          </div>
          <div v-if="participant.matchesPlayed > 0" class="text-sm text-gray-500 shrink-0">
            {{ t('tournamentParticipantsList.matchCount', { count: participant.matchesPlayed }) }}
          </div>
          <i class="fa fa-chevron-right text-gray-400 text-xs shrink-0"></i>
        </RouterLink>
        <UButton
          v-if="canAddParticipants"
          icon="i-fa7-solid:user-minus"
          color="error"
          variant="ghost"
          size="sm"
          class="rounded-full"
          :aria-label="t('common.delete')"
          @click="handleRemoveParticipant(participant.userId)"
        />
      </div>
    </div>

    <div v-else class="text-center py-8 text-gray-500 dark:text-gray-400">
      {{ t('tournamentParticipantsList.noParticipants') }}
    </div>

    <UModal
      v-model:open="showAddParticipantDialog"
      :title="t('tournamentParticipantsList.addParticipantsTitle')"
      :ui="{ content: 'sm:max-w-xl', footer: 'justify-end' }"
    >
      <template #body>
        <div v-if="loadingUsers" class="flex justify-center py-4">
          <UIcon name="i-lucide-loader-circle" class="size-10 animate-spin text-muted" />
        </div>
        <UFormField v-else :label="t('tournamentParticipantsList.selectUsersLabel')" size="xl">
          <USelectMenu
            v-model="selectedUserIds"
            :items="availableUsers"
            value-key="id"
            label-key="displayName"
            multiple
            :placeholder="t('tournamentParticipantsList.selectUsersPlaceholder')"
            class="w-full"
          />
        </UFormField>
        <UProgress v-if="addingParticipant" animation="carousel" size="xs" class="mt-4" />
      </template>
      <template #footer>
        <UButton
          :label="t('common.cancel')"
          color="neutral"
          variant="outline"
          :disabled="addingParticipant"
          @click="showAddParticipantDialog = false"
        />
        <UButton
          :label="t('tournamentParticipantsList.addButton')"
          icon="i-fa7-solid:check"
          :disabled="selectedUserIds.length === 0 || addingParticipant"
          :loading="addingParticipant"
          @click="handleAddParticipant"
        />
      </template>
    </UModal>
  </div>
</template>

<script setup lang="ts">
import PlayerAvatar from '@/components/PlayerAvatar.vue'
import { ref, computed, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { formatDate } from '@/utils/DateUtils'
import type { ParticipantListItem } from '@skol-arena/shared'
import { useAuth } from '@/composables/useAuth'
import { useUserService } from '@/composables/user/user.service'
import { useParticipantService } from '@/composables/participant.service'

interface Props {
  participants: ParticipantListItem[]
  loading?: boolean
  tournamentId: string
}

const props = defineProps<Props>()

const emit = defineEmits<{
  participantAdded: []
}>()

const { t } = useI18n()
const { isAdmin } = useAuth()
const { users, loading: loadingUsers, listUsers } = useUserService()
const participantService = useParticipantService()

const showAddParticipantDialog = ref(false)
const selectedUserIds = ref<string[]>([])
const addingParticipant = ref(false)

const canAddParticipants = computed(() => isAdmin.value)

const participantUserIds = computed(() => props.participants.map((p) => p.userId))

const availableUsers = computed(() => {
  return users.value.filter((user) => !participantUserIds.value.includes(user.id))
})

watch(showAddParticipantDialog, async (visible) => {
  if (visible) {
    if (users.value.length === 0) {
      await listUsers()
    }
  } else {
    selectedUserIds.value = []
  }
})

async function handleRemoveParticipant(userId: string) {
  await participantService.adminRemoveParticipantAndReload(props.tournamentId, userId)
  emit('participantAdded')
}

async function handleAddParticipant() {
  if (selectedUserIds.value.length === 0) return

  addingParticipant.value = true
  try {
    const success = await participantService.adminAddParticipantsBatchAndReload(
      props.tournamentId,
      selectedUserIds.value,
    )
    if (success) {
      showAddParticipantDialog.value = false
      selectedUserIds.value = []
      emit('participantAdded')
    }
  } finally {
    addingParticipant.value = false
  }
}
</script>
