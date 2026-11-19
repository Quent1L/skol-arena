import { computed, ref } from 'vue'
import type { VotePrompt } from '@skol-arena/shared/types/index'
import { votesApi } from './votes.api'

export type VotePromptSource = 'entry' | 'open'

/** The single vote prompt on screen. Module-level: one host shows it app-wide. */
const current = ref<{ prompt: VotePrompt; source: VotePromptSource } | null>(null)

/**
 * The post-match vote toast. Never throws and never insists: a prompt that cannot be
 * loaded is simply not shown, and nothing ever reminds the player about it.
 */
export function useVotePrompt() {
  /**
   * After entering a match (§6.1): the server says whether a vote is worth asking.
   * Resolves to whether the card will show — it then carries the "match saved" line.
   */
  async function offerForMatch(matchId: string): Promise<boolean> {
    try {
      const prompt = await votesApi.promptForMatch(matchId)
      if (!prompt || current.value) return false
      current.value = { prompt, source: 'entry' }
      return true
    } catch {
      // A nicety: the match page still offers the vote.
      return false
    }
  }

  /**
   * For the other players of a fresh match (§6.2): on opening the app, on coming back to
   * it, and the moment a match notification lands while it is open. The server picks the
   * match and decides whether to ask; the host waits for any full-screen moment (MMR
   * reveal, recap…) to end rather than compete with it.
   */
  async function offerPending(): Promise<void> {
    if (current.value) return
    try {
      const prompt = await votesApi.pendingPrompt()
      if (prompt && !current.value) current.value = { prompt, source: 'open' }
    } catch {
      // Not shown this time.
    }
  }

  /**
   * Called once the prompt is actually on screen (on its tournament page). Recorded at once as `expired` so it
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
