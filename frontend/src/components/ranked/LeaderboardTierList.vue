<template>
  <!-- Loading (first load only) -->
  <div v-if="showFullSpinner" class="flex justify-center items-center h-40">
    <ProgressSpinner />
  </div>

  <template v-else>
    <!-- Recalculation job in progress -->
    <div
      v-if="isRecalculating"
      class="flex items-center justify-center gap-2 mb-3 text-sm text-orange-400"
    >
      <i class="fa fa-sync fa-spin" />
      {{ t('rankedLeaderboard.recalculating') }}
    </div>

    <!-- Plain refresh in progress (data already shown) -->
    <div
      v-else-if="isRefreshing"
      class="flex items-center justify-center gap-2 mb-3 text-sm text-gray-400"
    >
      <i class="fa fa-sync fa-spin" />
      {{ t('rankedLeaderboard.refreshing') }}
    </div>

    <!-- No tiers configured -->
    <div v-if="!props.tiers.length" class="text-center py-12 text-gray-500">
      <i class="fa fa-trophy text-4xl mb-4 block opacity-30"></i>
      {{ t('rankedLeaderboard.noTiers') }}
    </div>

    <!-- Tier sections -->
    <div v-else class="space-y-3">
      <div
        v-for="group in tierGroups"
        :key="group.tier.id"
        class="rounded-2xl overflow-hidden"
        :class="tierCardClass(group.tier)"
      >
        <!-- Tier header -->
        <div class="flex items-center gap-3 px-4 py-3">
          <div class="w-1 h-5 rounded-full shrink-0" :class="tierBarClass(group.tier)" />
          <i
            :class="tierIconClass(group.tier)"
            class="text-sm w-4 text-center shrink-0"
            :style="{ color: tierTextColor(group.tier) }"
          />
          <span class="font-bold text-sm" :style="{ color: tierTextColor(group.tier) }">{{
            tierName(group.tier)
          }}</span>
          <span class="text-xs text-gray-500 ml-auto shrink-0">{{ tierThreshold(group.tier) }}</span>
        </div>

        <!-- Player rows -->
        <template v-if="group.players.length">
          <RouterLink
            v-for="(player, idx) in group.players"
            :key="player.player?.id ?? idx"
            :to="player.player ? playerLink(player.player.id, props.tournamentId) : '#'"
            class="flex items-center gap-3 px-4 py-2.5 border-t border-white/5 transition-colors"
            :class="
              player.player?.id === props.currentUserId
                ? 'bg-primary-900/30 hover:bg-primary-800/40'
                : 'hover:bg-white/5'
            "
          >
            <!-- Global rank -->
            <div class="w-5 text-center text-xs font-bold text-gray-500 shrink-0">
              {{ rankOf(player) }}
            </div>

            <!-- Avatar -->
            <PlayerAvatar
              :name="player.player?.displayName ?? '?'"
              :player-id="player.player?.id"
              shape="square"
              size="sm"
              class="shrink-0"
            />

            <!-- Name + recent matches + progress bar -->
            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-1.5 min-w-0">
                <span class="font-semibold text-sm truncate">{{
                  player.player?.displayName ?? t('rankedLeaderboard.unknownPlayer')
                }}</span>
                <span
                  v-if="player.player?.id === props.currentUserId"
                  class="text-[9px] font-bold text-primary-400 uppercase tracking-wide shrink-0"
                  >{{ t('rankedLeaderboard.you') }}</span
                >
              </div>
              <div class="flex items-center justify-between">
                <div class="flex text-[10px] w-full">{{ getPlayedMatchLabel(player) }}</div>
                <div class="flex items-center justify-end w-full mt-1">
                  <RecentFormBadges
                    v-if="!isSeasonMode && player.recentResults?.length"
                    :results="
                      player.recentResults.map((r) =>
                        r.outcome === 'win' ? 'V' : r.outcome === 'loss' ? 'D' : 'N',
                      )
                    "
                  />
                </div>
              </div>
              <div
                v-if="!isTopTier(group.tier, props.tiers)"
                class="mt-1.5 h-1 rounded-full bg-gray-700/50 overflow-hidden"
              >
                <div
                  class="h-full rounded-full"
                  :class="tierBarClass(group.tier)"
                  :style="{ width: `${tierProgress(displayMmr(player), group.tier)}%` }"
                />
              </div>
            </div>

            <!-- LP / MMR + streak. Streaks describe the player's state right now, so
                 they are meaningless next to a season-wide aggregate. -->
            <div class="text-right shrink-0">
              <div class="font-black text-sm tabular-nums">{{ displayMmr(player) }}</div>
              <template v-if="!isSeasonMode">
                <div v-if="player.winStreak > 1" class="text-[10px] text-orange-400">
                  🔥 {{ player.winStreak }}
                </div>
                <div v-else-if="player.lossStreak > 1" class="text-[10px] text-blue-400">
                  💀 {{ player.lossStreak }}
                </div>
              </template>
            </div>
          </RouterLink>
        </template>

        <!-- Empty state -->
      </div>

      <!-- Players still in placement: listed apart, without MMR nor rank. -->
      <PlacementPlayersList
        v-if="inPlacement.length"
        :players="inPlacement"
        :placement-matches="props.placementMatches ?? 0"
        :current-user-id="props.currentUserId"
        :tournament-id="props.tournamentId"
      />
    </div>
  </template>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { RouterLink } from 'vue-router'
import { playerLink } from '@/utils/player-link'
import { assignCompetitionRanks } from '@/utils/competition-rank'
import type {
  ClientPlayerMmr,
  ClientSeasonMmrPlayer,
  ClientRankTier,
} from '@skol-arena/shared/types/index'
import {
  isTopTier,
  getNextTier,
  getPrevTier,
  getTierForMmr,
  splitByPlacement,
} from '@/composables/ranked/ranked.service'
import { useServerLabels } from '@/i18n/serverLabels'
import PlayerAvatar from '@/components/PlayerAvatar.vue'
import PlacementPlayersList from '@/components/ranked/PlacementPlayersList.vue'
import RecentFormBadges from '@/components/player/RecentFormBadges.vue'
import {
  TIER_BAR_CLASS as TIER_BAR,
  TIER_CARD_CLASS as TIER_CARD,
  tierStyleIdx,
  getTierIconClass,
  getTierTextHex,
} from '@/composables/ranked/tier-style'

const { t } = useI18n()
const { tierName } = useServerLabels()

const props = defineProps<{
  players: ClientPlayerMmr[]
  tiers: ClientRankTier[]
  /** Which number each row is ranked and grouped on. */
  metric: 'current' | 'peak' | 'average'
  currentUserId?: string
  tournamentId?: string
  loading?: boolean
  isRecalculating?: boolean
  /** Matches needed to be ranked. 0 disables the placement section entirely. */
  placementMatches?: number
}>()

const isSeasonMode = computed(() => props.metric !== 'current')

// Season views (peak/average) are already restricted to players past the
// placement threshold server-side, so everything they carry is ranked.
const split = computed(() =>
  isSeasonMode.value
    ? { placed: props.players, inPlacement: [] }
    : splitByPlacement(props.players, props.placementMatches ?? 0),
)
const rankedPlayers = computed(() => split.value.placed)
const inPlacement = computed(() => split.value.inPlacement)

// The ranked value of this view: current MMR, or the season aggregate.
function displayMmr(player: ClientPlayerMmr): number {
  if (!isSeasonMode.value) return player.currentMmr
  const seasonPlayer = player as ClientSeasonMmrPlayer
  return props.metric === 'peak' ? seasonPlayer.peakMmr : seasonPlayer.avgMmr
}

// Full-screen spinner only on first load (no data yet). A refresh of an
// already-shown leaderboard keeps the list visible and shows a subtle banner.
const showFullSpinner = computed(() => props.loading && props.players.length === 0)
const isRefreshing = computed(() => props.loading && props.players.length > 0)

// Competition ranks: two players on the same MMR are joint Nth, not Nth and N+1th.
const rankMap = computed(() => {
  const map = new Map<string, number>()
  for (const { item, rank } of assignCompetitionRanks(rankedPlayers.value, displayMmr)) {
    if (item.player?.id) map.set(item.player.id, rank)
  }
  return map
})

const sortedTiers = computed(() => [...props.tiers].sort((a, b) => b.level - a.level))

const tierGroups = computed(() =>
  sortedTiers.value.map((tier) => ({
    tier,
    players: rankedPlayers.value.filter((p) => getPlayerTier(displayMmr(p))?.id === tier.id),
  })),
)

function getPlayerTier(mmr: number): ClientRankTier | null {
  return getTierForMmr(mmr, props.tiers)
}

function tierTextColor(tier: ClientRankTier): string {
  return getTierTextHex(tier)
}

function tierIconClass(tier: ClientRankTier): string {
  return getTierIconClass(tier)
}

function tierCardClass(tier: ClientRankTier): string {
  return TIER_CARD[tierStyleIdx(tier)] ?? 'bg-gray-800/70'
}

function tierBarClass(tier: ClientRankTier): string {
  return TIER_BAR[tierStyleIdx(tier)] ?? 'bg-gray-400'
}

function tierThreshold(tier: ClientRankTier): string {
  const isLowestTier = !getPrevTier(tier, props.tiers)
  if (!isLowestTier) return `${tier.minMmr}+ MMR`
  const above = getNextTier(tier, props.tiers)
  return above ? `< ${above.minMmr} MMR` : `${tier.minMmr}+ MMR`
}

function tierProgress(mmr: number, tier: ClientRankTier): number {
  const next = getNextTier(tier, props.tiers)
  if (!next) return 100
  const range = next.minMmr - tier.minMmr
  if (range <= 0) return 100
  return Math.min(100, Math.max(0, ((mmr - tier.minMmr) / range) * 100))
}

function rankOf(player: ClientPlayerMmr): number | string {
  if (!player.player?.id) return '?'
  return rankMap.value.get(player.player.id) ?? '?'
}

function getPlayedMatchLabel(player: ClientPlayerMmr): string {
  const number = player.matchesPlayed
  if (number === 1) return `${number} ${t('rankedLeaderboard.matchSingular')}`
  if (number >= 2) return `${number} ${t('rankedLeaderboard.matchPlural')}`
  return ''
}
</script>
