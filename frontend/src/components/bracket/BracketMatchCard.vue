<template>
  <div
    class="bracket-match"
    :class="{ 'bracket-match--pending': !isClickable }"
    :tabindex="isClickable ? 0 : -1"
    @click="isClickable && emit('click', match.id)"
  >
    <!-- Status caption -->
    <div class="bracket-caption mt-auto mb-1">
      <span class="bracket-status">
        <span class="bracket-status-dot" :class="statusDotClass(match.status)"></span>
        <span class="bracket-status-label" :class="statusTextClass(match.status)">
          {{ statusLabel(match.status) }}
        </span>
      </span>
    </div>
    <!-- Body: side A | score/VS | side B -->
    <div class="flex items-center gap-2 flex-1">
      <!-- Side A -->
      <div class="flex-1 flex flex-col items-center gap-1 relative">
        <i
          v-if="match.status !== 'cancelled' && isWinner(match, sideA)"
          class="fa fa-trophy text-yellow-500 text-[10px] absolute -top-3.5 left-1/2 -translate-x-1/2"
        ></i>
        <template v-if="sideA">
          <PlayerAvatar :name="getEntryName(sideA.entryId)" size="xs" />
          <abbr
            class="bracket-code text-center"
            :title="getEntryName(sideA.entryId)"
            :class="isWinner(match, sideA) === false ? 'opacity-40' : ''"
          >
            {{ getEntryCode(sideA.entryId) }}
          </abbr>
        </template>
        <template v-else>
          <i class="fas fa-user-clock text-muted text-sm"></i>
        </template>
      </div>

      <!-- Center -->
      <div
        v-if="match.tournament?.scoreEnabled"
        class="font-headline font-black tabular-nums text-sm flex items-center gap-1 shrink-0"
      >
        <span
          class="px-1 py-0.5 rounded text-xs"
          :class="
            isWinner(match, sideA)
              ? 'bg-match-win/20 text-match-win'
              : isWinner(match, sideA) === false
                ? 'bg-match-loss/20 text-match-loss'
                : 'text-highlighted'
          "
        >
          {{ match.status === 'scheduled' ? '-' : (sideA?.score ?? '-') }}
        </span>
        <span class="text-[10px]">-</span>
        <span
          class="px-1 py-0.5 rounded text-xs"
          :class="
            isWinner(match, sideB)
              ? 'bg-match-win/20 text-match-win'
              : isWinner(match, sideB) === false
                ? 'bg-match-loss/20 text-match-loss'
                : 'text-highlighted'
          "
        >
          {{ match.status === 'scheduled' ? '-' : (sideB?.score ?? '-') }}
        </span>
      </div>
      <div v-else class="font-headline font-black text-xs shrink-0">{{ t('bracketMatchCard.vs') }}</div>

      <!-- Side B -->
      <div class="flex-1 flex flex-col items-center gap-1 relative">
        <i
          v-if="match.status !== 'cancelled' && isWinner(match, sideB)"
          class="fa fa-trophy text-yellow-500 text-[10px] absolute -top-3.5 left-1/2 -translate-x-1/2"
        ></i>
        <template v-if="sideB">
          <PlayerAvatar :name="getEntryName(sideB.entryId)" size="xs" />
          <abbr
            class="bracket-code text-center"
            :title="getEntryName(sideB.entryId)"
            :class="isWinner(match, sideB) === false ? 'opacity-40' : ''"
          >
            {{ getEntryCode(sideB.entryId) }}
          </abbr>
        </template>
        <template v-else>
          <i class="fas fa-user-clock text-muted text-sm"></i>
        </template>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useMatchStatus } from '@/composables/match/match-status-style'
import type { ClientMatchModel, MatchSideModel, ClientBracketSeed } from '@skol-arena/shared'
import PlayerAvatar from '@/components/PlayerAvatar.vue'

interface Props {
  match: ClientMatchModel
  roundName: string
  bracketType: 'winners' | 'losers' | 'bronze'
  isFinal?: boolean
  seeds: ClientBracketSeed[]
}

const props = defineProps<Props>()
const emit = defineEmits<{ click: [matchId: string] }>()

const { t } = useI18n()
const { statusLabel, statusDotClass, statusTextClass } = useMatchStatus()

const isClickable = computed(() => (props.match.sides?.length ?? 0) >= 2)

const sideA = computed(() => props.match.sides?.find((s) => s.position === 1) ?? null)
const sideB = computed(() => props.match.sides?.find((s) => s.position === 2) ?? null)

function getEntryName(entryId: string): string {
  const seed = props.seeds.find((s) => s.entryId === entryId)
  if (!seed?.entry) return t('bracketMatchCard.unknown')

  if (seed.entry.entryType === 'TEAM' && seed.entry.team) {
    return seed.entry.team.name
  }

  if (seed.entry.entryType === 'PLAYER' && seed.entry.players?.length > 0) {
    return seed.entry.players[0].player.shortName
  }

  return t('bracketMatchCard.unknown')
}

function getEntryCode(entryId: string): string {
  return getEntryName(entryId).toUpperCase()
}

function isWinner(match: ClientMatchModel, side: MatchSideModel | null): boolean | null {
  if (!side) return null
  if (match.status !== 'confirmed' && match.status !== 'finalized' && match.status !== 'reported')
    return null
  if (match.winnerSide != null) {
    return match.winnerSide === (side.position === 1 ? 'A' : 'B')
  }
  return null
}

</script>

<style scoped>
.bracket-match {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  overflow: hidden;
  background-color: var(--ui-color-neutral-800);
  padding: 0.6em 0.75em 0.75em;
  border: 1px solid transparent;
  border-radius: 0.25em;
  outline: none;
  cursor: pointer;
  transition:
    border 0.2s linear,
    box-shadow 0.15s ease;
}

.bracket-match--pending {
  cursor: default;
  opacity: 0.6;
}

.bracket-match:not(.bracket-match--pending):hover {
  box-shadow: 0 4px 16px rgba(33, 150, 243, 0.2);
  border-color: rgba(33, 150, 243, 0.4);
}

.bracket-match:focus {
  border-color: #2196f3;
}

.bracket-caption {
  font-size: 0.8rem;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.bracket-status {
  display: flex;
  align-items: center;
  gap: 0.3em;
}

.bracket-status-dot {
  width: 0.45em;
  height: 0.45em;
  border-radius: 50%;
  flex-shrink: 0;
}

.bracket-status-label {
  font-size: 0.6rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.bracket-code {
  font-size: 0.65rem;
  color: var(--ui-text-highlighted);
  font-weight: 600;
  text-transform: uppercase;
  border: 0;
  text-decoration: none;
  cursor: help;
  line-height: 1.2;
  max-width: 5rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  display: block;
}

.bracket-medal {
  margin-top: 0.15rem;
}

.bracket-medal--gold {
  color: #ffd700;
}

.bracket-medal--silver {
  color: #c0c0c0;
}

.bracket-medal--bronze {
  color: #cd7f32;
}
</style>
