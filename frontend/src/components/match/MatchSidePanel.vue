<template>
  <div
    class="side-panel relative flex flex-col items-center rounded-xl px-2 py-3 text-center transition-all duration-300 sm:px-3 sm:py-4"
    :class="[
      isWinner
        ? 'bg-match-win/[0.07] ring-1 ring-match-win/30'
        : 'bg-slate-900/40 ring-1 ring-slate-700/40',
      dimmed ? 'opacity-70 saturate-[0.55]' : '',
    ]"
  >
    <!-- Crown marks the outcome the moment the eye lands on the panel. Before
         finalization it is dimmed: the result is claimed, not settled. -->
    <div class="mb-1 flex h-5 items-center justify-center">
      <i
        v-if="isWinner"
        class="crown fa fa-crown text-sm"
        :class="isFinalized ? 'text-match-win' : 'text-match-win/50'"
        aria-hidden="true"
      />
    </div>

    <PlayerAvatarStack v-if="side?.players?.length" :players="side.players" size="md" />

    <div
      class="font-headline mt-2 max-w-full truncate text-sm font-black uppercase tracking-tight"
      :class="isWinner ? 'text-match-win' : 'text-white/80'"
    >
      {{ side?.entryName ?? fallbackName }}
    </div>

    <!-- Says out loud that the green is the reporter's claim, so a participant knows
         what they are validating even when the score does not imply the winner. -->
    <span
      v-if="isWinner && !isFinalized"
      class="font-label mt-1 rounded-full border border-match-win/30 bg-match-win/10 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-match-win/90"
    >
      {{ t('matchDetailView.declaredWinner') }}
    </span>

    <div v-if="side?.players?.length" class="mt-2.5 flex w-full flex-col items-center gap-1.5">
      <!-- One line per player, never two: the name is the only part allowed to shrink,
           so a long name ellipses instead of pushing its badges to the next line. -->
      <div
        v-for="player in side.players"
        :key="player.id"
        class="flex w-full max-w-full items-center justify-center gap-1.5"
      >
        <RouterLink
          v-if="player.id"
          :to="{
            path: `/players/${player.id}`,
            query: tournamentId ? { tournamentId } : {},
          }"
          class="font-label min-w-0 truncate text-sm font-semibold text-white/70 transition-colors hover:text-primary"
        >
          {{ player.displayName }}
        </RouterLink>
        <span v-else class="font-label min-w-0 truncate text-sm font-semibold text-white/70">
          {{ player.displayName }}
        </span>

        <template v-if="isFinalized && mode === 'championship' && player.effectivePointsAwarded !== undefined">
          <span
            v-if="player.exceededMatchLimit"
            class="font-label shrink-0 rounded-full border border-slate-600 bg-slate-700/50 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-muted"
          >
            {{ t('matchDetailView.overLimit') }}
          </span>
          <span v-else class="font-headline shrink-0 rounded-full border px-1.5 py-0.5 text-xs font-black tabular-nums" :class="deltaPillClass(player.effectivePointsAwarded)">
            <i class="fa fa-star mr-0.5 text-[9px]" aria-hidden="true" />
            +{{ player.effectivePointsAwarded }}
          </span>
        </template>

        <span
          v-if="isFinalized && mode === 'ranked' && player.mmrDelta !== undefined && player.mmrDelta !== null"
          class="font-headline shrink-0 rounded-full border px-1.5 py-0.5 text-xs font-black tabular-nums"
          :class="deltaPillClass(player.mmrDelta)"
        >
          <i class="fa fa-bolt mr-0.5 text-[9px]" aria-hidden="true" />
          {{ player.mmrDelta > 0 ? '+' : '' }}{{ player.mmrDelta }}
        </span>

        <!-- Validation state. Rendered only while a round is open, so a settled match
             keeps the exact line width it had before. -->
        <span
          v-if="statusOf(player.id)"
          class="inline-flex shrink-0 items-center"
          :title="statusLabel(statusOf(player.id)!)"
        >
          <i
            class="fa text-[11px]"
            :class="[statusIcon(statusOf(player.id)!), statusClass(statusOf(player.id)!)]"
            aria-hidden="true"
          />
          <span class="sr-only">{{ statusLabel(statusOf(player.id)!) }}</span>
        </span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { RouterLink } from 'vue-router'
import type { MatchDetailSide } from '@skol-arena/shared/types/index'
import PlayerAvatarStack from '@/components/PlayerAvatarStack.vue'
import {
  useConfirmationStatus,
  type ConfirmationStatus,
} from '@/composables/match/match-confirmation-status'

const props = defineProps<{
  side?: MatchDetailSide
  fallbackName: string
  mode?: string
  isFinalized: boolean
  /** Whether the reported winner may be shown — false while no result exists yet. */
  showWinner?: boolean
  /** playerId → validation state. Absent (or missing a player) means no marker at all. */
  confirmationStatuses?: Map<string, ConfirmationStatus>
  tournamentId?: string
  dimmed?: boolean
}>()

const { t } = useI18n()
const { statusLabel, statusIcon, statusClass } = useConfirmationStatus()

function statusOf(playerId?: string): ConfirmationStatus | undefined {
  if (!playerId) return undefined
  return props.confirmationStatuses?.get(playerId)
}

/**
 * The winner is highlighted as soon as a result is reported: the score alone does not
 * always tell who won, and a participant cannot validate what they cannot read. Points
 * and MMR stay hidden until finalization — those are only awarded then.
 */
const isWinner = computed(() => props.showWinner !== false && props.side?.isWinner === true)

/** Same pill vocabulary as MatchCard, so a delta reads identically in a list and here. */
function deltaPillClass(delta: number): string {
  if (delta > 0) return 'bg-match-win/15 text-match-win border-match-win/30'
  if (delta < 0) return 'bg-match-loss/15 text-match-loss border-match-loss/30'
  return 'bg-match-neutral/15 text-match-neutral border-match-neutral/30'
}
</script>

<style scoped>
.crown {
  animation: crown-pop 420ms cubic-bezier(0.34, 1.56, 0.64, 1) both;
}

@keyframes crown-pop {
  0% {
    opacity: 0;
    transform: scale(0.4) translateY(4px);
  }
  100% {
    opacity: 1;
    transform: scale(1) translateY(0);
  }
}

@media (prefers-reduced-motion: reduce) {
  .side-panel,
  .crown {
    animation: none;
    transition-duration: 0.01ms;
  }
}
</style>
