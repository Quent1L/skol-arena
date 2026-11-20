<template>
  <div class="tournament-bracket-root">
    <BracketCanvas
      :title="t('tournamentBracket.mainBracket')"
      :rounds="winnersRounds"
      :all-matches="bracketData.matches"
      :seeds="bracketData.seeds"
      :final-round-id="finalRoundId"
      bracket-type="winners"
      @go-to-match="goToMatch"
    />

    <BracketCanvas
      v-if="bronzeRound"
      :title="t('tournamentBracket.bronzeMatch')"
      :rounds="[bronzeRound]"
      :all-matches="bracketData.matches"
      :seeds="bracketData.seeds"
      bracket-type="bronze"
      @go-to-match="goToMatch"
    />

    <BracketCanvas
      v-if="losersRounds.length > 0"
      :title="t('tournamentBracket.losersBracket')"
      :rounds="losersRounds"
      :all-matches="bracketData.matches"
      :seeds="bracketData.seeds"
      bracket-type="losers"
      @go-to-match="goToMatch"
    />
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import type { ClientBracketData } from '@skol-arena/shared'
import BracketCanvas from '@/components/bracket/BracketCanvas.vue'

interface Props {
  bracketData: ClientBracketData
}

const props = defineProps<Props>()
const router = useRouter()
const { t } = useI18n()

const winnersRounds = computed(() =>
  props.bracketData.rounds
    .filter((r) => r.bracketType === 'winners')
    .sort((a, b) => a.roundNumber - b.roundNumber),
)

const finalRoundId = computed(() => winnersRounds.value.at(-1)?.id)

const losersRounds = computed(() =>
  props.bracketData.rounds
    .filter((r) => r.bracketType === 'losers')
    .sort((a, b) => a.roundNumber - b.roundNumber),
)

const bronzeRound = computed(() => props.bracketData.rounds.find((r) => r.bracketType === 'bronze'))

function goToMatch(matchId: string): void {
  router.push(`/matches/${matchId}`)
}
</script>

<style scoped>
.tournament-bracket-root {
  width: 100%;
  padding: 1.25rem 0;
  font-family: 'Work Sans', 'Helvetica Neue', Arial, sans-serif;
}
</style>
