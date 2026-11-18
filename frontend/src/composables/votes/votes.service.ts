import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import type { FairPlayTag, FairPlayVoteValue, MatchVotes } from '@skol-arena/shared/types/index'
import { useAppToast } from '@/composables/useAppToast'
import { votesApi } from './votes.api'

/**
 * Votes of one match for the signed-in user. Each write answers with the fresh state,
 * so the view never recomputes MVP or eligibility itself.
 */
export function useMatchVotes() {
  const toast = useAppToast()
  const { t } = useI18n()

  const votes = ref<MatchVotes | null>(null)
  const saving = ref(false)
  /** Bumped after each successful write: drives the "Saved ✓" flash. */
  const savedAt = ref(0)

  async function load(matchId: string): Promise<void> {
    try {
      votes.value = await votesApi.get(matchId)
    } catch {
      // Optional section: it drops out rather than taking the page down.
      votes.value = null
    }
  }

  /** Applies `optimistic` at once, then the server state; rolls back on failure. */
  async function run(call: () => Promise<MatchVotes>, optimistic?: (v: MatchVotes) => MatchVotes) {
    const before = votes.value
    if (before && optimistic) votes.value = optimistic(before)
    saving.value = true
    try {
      votes.value = await call()
      savedAt.value = Date.now()
    } catch (err) {
      votes.value = before
      toast.add({
        severity: 'error',
        summary: t('common.error'),
        detail: err instanceof Error ? err.message : t('matchVotes.saveFailed'),
        life: 5000,
      })
    } finally {
      saving.value = false
    }
  }

  const matchId = () => votes.value?.matchId ?? ''

  const withFairPlay = (v: MatchVotes, myVotes: NonNullable<MatchVotes['fairPlay']>['myVotes']) =>
    v.fairPlay ? { ...v, fairPlay: { ...v.fairPlay, myVotes } } : v
  const otherFairPlay = (v: MatchVotes, targetId: string) =>
    (v.fairPlay?.myVotes ?? []).filter((vote) => vote.targetId !== targetId)
  const withMvp = (v: MatchVotes, myVote: string | null) => (v.mvp ? { ...v, mvp: { ...v.mvp, myVote } } : v)

  return {
    votes,
    saving,
    savedAt,
    load,
    castFairPlay: (targetId: string, value: FairPlayVoteValue, tags: FairPlayTag[] = []) =>
      run(
        () => votesApi.castFairPlay(matchId(), targetId, { value, tags }),
        (v) => withFairPlay(v, [...otherFairPlay(v, targetId), { targetId, value, tags }]),
      ),
    removeFairPlay: (targetId: string) =>
      run(
        () => votesApi.removeFairPlay(matchId(), targetId),
        (v) => withFairPlay(v, otherFairPlay(v, targetId)),
      ),
    teamUp: () => run(() => votesApi.castFairPlayTeamUp(matchId())),
    declareSpectator: () => run(() => votesApi.declareSpectator(matchId())),
    withdrawSpectator: () => run(() => votesApi.withdrawSpectator(matchId())),
    castMvp: (targetId: string) =>
      run(() => votesApi.castMvp(matchId(), targetId), (v) => withMvp(v, targetId)),
    removeMvp: () => run(() => votesApi.removeMvp(matchId()), (v) => withMvp(v, null)),
  }
}
