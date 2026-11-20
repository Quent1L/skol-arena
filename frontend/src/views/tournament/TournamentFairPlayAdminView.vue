<template>
  <div class="mx-auto max-w-4xl space-y-6 px-4 py-6">
    <AdminPageHeader :title="t('fairPlayAdmin.title')" />
    <p class="text-sm text-muted">{{ t('fairPlayAdmin.description') }}</p>

    <UAlert v-if="error" color="error" variant="subtle" :title="error" />

    <UCard v-if="stats">
      <template #header>
        <h2 class="font-semibold text-highlighted">{{ t('fairPlayAdmin.received') }}</h2>
      </template>
      <p v-if="stats.received.length === 0" class="text-sm text-muted">
        {{ t('fairPlayAdmin.noneReceived') }}
      </p>
      <ul class="divide-y divide-default">
        <li
          v-for="row in stats.received"
          :key="row.player.id"
          class="space-y-2 py-3"
          :data-testid="`fair-play-admin-${row.player.id}`"
        >
          <div class="flex flex-wrap items-center gap-3">
            <PlayerAvatar :name="row.player.displayName" :player-id="row.player.id" size="sm" />
            <span class="min-w-0 flex-1 truncate font-semibold">{{ row.player.displayName }}</span>
            <UBadge
              :label="t('fairPlayAdmin.downs', { count: row.down, recent: row.downLast30Days })"
              :color="row.downLast30Days >= threshold ? 'warning' : 'neutral'"
              variant="subtle"
            />
            <UButton
              :label="t('fairPlayAdmin.reveal')"
              icon="i-fa7-solid:eye"
              size="xs"
              variant="outline"
              color="neutral"
              :loading="revealing === row.player.id"
              @click="reveal(row.player.id)"
            />
          </div>
          <p v-if="row.tags.length" class="text-xs text-muted">{{ tagLine(row.tags) }}</p>
          <ul v-if="revealed[row.player.id]" class="space-y-1 rounded-lg bg-elevated p-3 text-xs">
            <li v-for="v in revealed[row.player.id]" :key="`${v.matchId}-${v.voter.id}`">
              <RouterLink :to="`/matches/${v.matchId}`" class="text-primary">{{
                v.voter.displayName
              }}</RouterLink>
              · {{ v.createdAt.toLocaleDateString(locale) }}
              <span v-if="v.tags.length"
                >· {{ v.tags.map((tag) => t(`matchVotes.fairPlay.tags.${tag}`)).join(', ') }}</span
              >
            </li>
          </ul>
        </li>
      </ul>
    </UCard>

    <UCard v-if="stats?.voters.length">
      <template #header>
        <h2 class="font-semibold text-highlighted">{{ t('fairPlayAdmin.voters') }}</h2>
        <p class="text-xs text-muted">{{ t('fairPlayAdmin.votersHelp') }}</p>
      </template>
      <ul class="divide-y divide-default">
        <li
          v-for="row in stats.voters"
          :key="row.player.id"
          class="flex items-center gap-3 py-2 text-sm"
        >
          <PlayerAvatar :name="row.player.displayName" :player-id="row.player.id" size="xs" />
          <span class="min-w-0 flex-1 truncate">{{ row.player.displayName }}</span>
          <span class="tabular-nums text-muted">{{
            t('fairPlayAdmin.cast', { count: row.cast })
          }}</span>
          <span class="w-14 text-right font-semibold tabular-nums"
            >{{ Math.round(row.downRate * 100) }} % 👎</span
          >
        </li>
      </ul>
    </UCard>

    <UCard v-if="stats">
      <template #header>
        <h2 class="font-semibold text-highlighted">{{ t('fairPlayAdmin.log') }}</h2>
      </template>
      <p v-if="stats.revealLog.length === 0" class="text-sm text-muted">
        {{ t('fairPlayAdmin.noLog') }}
      </p>
      <ul class="space-y-1 text-sm">
        <li v-for="(entry, i) in stats.revealLog" :key="i">
          {{
            t('fairPlayAdmin.logEntry', {
              admin: entry.admin?.displayName ?? '?',
              target: entry.target.displayName,
            })
          }}
          <span class="text-muted">· {{ entry.createdAt.toLocaleString(locale) }}</span>
        </li>
      </ul>
    </UCard>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import type { AdminVoteStats, RevealedVoters } from '@skol-arena/shared/types/index'
import { resolveVoteConfig } from '@skol-arena/shared/types/index'
import { votesApi } from '@/composables/votes/votes.api'
import { useTournamentService } from '@/composables/tournament/tournament.service'
import AdminPageHeader from '@/components/admin/AdminPageHeader.vue'
import PlayerAvatar from '@/components/PlayerAvatar.vue'

/** Organizers' fair-play view: 👎 per player, voters revealed on demand and logged. */
const route = useRoute()
const { t, locale } = useI18n()
const { currentTournament, getTournament } = useTournamentService()

const tournamentId = computed(() => route.params.id as string)
const stats = ref<AdminVoteStats | null>(null)
const error = ref<string | null>(null)
const revealing = ref<string | null>(null)
const revealed = ref<Record<string, RevealedVoters>>({})
const threshold = computed(
  () => resolveVoteConfig(currentTournament.value?.voteConfig).fairPlayAlertThreshold,
)

async function load() {
  try {
    stats.value = await votesApi.adminStats(tournamentId.value)
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err)
  }
}

async function reveal(playerId: string) {
  revealing.value = playerId
  try {
    revealed.value = {
      ...revealed.value,
      [playerId]: await votesApi.reveal(tournamentId.value, playerId),
    }
    await load()
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err)
  } finally {
    revealing.value = null
  }
}

const tagLabel = (tag: string) => t(`matchVotes.fairPlay.tags.${tag}`)
const tagLine = (tags: { tag: string; count: number }[]) =>
  tags.map((x) => `${tagLabel(x.tag)} ×${x.count}`).join(', ')

onMounted(() => {
  void getTournament(tournamentId.value)
  void load()
})
</script>
