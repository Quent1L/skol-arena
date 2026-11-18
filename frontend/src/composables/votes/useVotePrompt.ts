import { computed, ref } from 'vue'
import type { VotePrompt } from '@skol-arena/shared/types/index'
import { screenTakenOver } from '@/composables/useScreenTakeover'
import { votesApi } from './votes.api'

export type VotePromptSource = 'entry' | 'open'

/** The single vote prompt on screen. Module-level: one host shows it app-wide. */
const current = ref<{ prompt: VotePrompt; source: VotePromptSource } | null>(null)

/**
 * The post-match vote toast. Never throws and never insists: a prompt that cannot be
 * loaded is simply not shown, and nothing ever reminds the player about it.
 */
export function useVotePrompt() {
  /** After entering a match (§6.1): the server says whether a vote is worth asking. */
  async function offerForMatch(matchId: string): Promise<void> {
    try {
      const prompt = await votesApi.promptForMatch(matchId)
      if (prompt && !current.value) current.value = { prompt, source: 'entry' }
    } catch {
      // A nicety: the match page still offers the vote.
    }
  }

  /**
   * On opening the app (§6.2): the latest match someone else entered. Never competes
   * with a full-screen moment — if one is playing, this opening gets no prompt.
   */
  async function offerPending(): Promise<void> {
    if (current.value || screenTakenOver.value) return
    try {
      const prompt = await votesApi.pendingPrompt()
      if (prompt && !current.value && !screenTakenOver.value) current.value = { prompt, source: 'open' }
    } catch {
      // Not shown this time.
    }
  }

  /**
   * Called once the prompt is actually on screen. Recorded at once as `expired` so it
   * never shows twice, even if the app is closed under it; a vote cast from it later
   * settles it as `voted` and resets the back-off server-side.
   */
  async function markShown(): Promise<void> {
    const matchId = current.value?.prompt.matchId
    if (!matchId) return
    try {
      await votesApi.recordPrompt(matchId, 'expired')
    } catch {
      // Worst case it shows once more.
    }
  }

  function close(): void {
    current.value = null
  }

  return { current: computed(() => current.value), offerForMatch, offerPending, markShown, close }
}
