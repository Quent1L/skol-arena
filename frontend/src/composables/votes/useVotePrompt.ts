import { computed, ref } from 'vue'
import type { VotePrompt, VotePromptOutcome } from '@skol-arena/shared/types/index'
import { votesApi } from './votes.api'

export type VotePromptSource = 'entry' | 'open'

/** The single vote prompt on screen. Module-level: one host shows it app-wide. */
const current = ref<{ prompt: VotePrompt; source: VotePromptSource } | null>(null)
/** The "shown" record of the prompt on screen: its outcome is only sent once it landed. */
let shownRecord: Promise<void> | null = null

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
  if (current.value && !isWaiting()) return
  try {
    const prompt = await votesApi.pendingPrompt()
    if (current.value && !isWaiting()) return
    // Only ever the latest match: a newer one replaces a prompt still waiting for its
    // tournament page, and a waiting one that no longer is the latest is dropped.
    current.value = prompt ? { prompt, source: 'open' } : null
  } catch {
    // Not shown this time.
  }
}

/** Loaded on opening the app but not on screen yet, so nothing recorded server-side. */
function isWaiting(): boolean {
  return current.value?.source === 'open' && !shownRecord
}

/**
 * Called once the prompt is actually on screen (on its tournament page). Recorded at
 * once so it never shows twice, even if the app is closed under it. This first record
 * counts as nothing; `finish` then says how it ended.
 */
function markShown(): void {
  const matchId = current.value?.prompt.matchId
  if (!matchId) return
  // Worst case it shows once more.
  shownRecord = votesApi.recordPrompt(matchId, 'expired').catch(() => {})
}

/** Closes the prompt and settles it server-side, after its "shown" record landed. */
async function finish(outcome: VotePromptOutcome): Promise<void> {
  const matchId = current.value?.prompt.matchId
  const shown = shownRecord
  close()
  if (!matchId || !shown) return
  await shown
  try {
    await votesApi.recordPrompt(matchId, outcome)
  } catch {
    // Unsettled: it counts as ignored, nothing worse.
  }
}

/** Drops the prompt without a word to the server, e.g. on logout. */
function close(): void {
  current.value = null
  shownRecord = null
}

/**
 * The post-match vote toast. Never throws and never insists: a prompt that cannot be
 * loaded is simply not shown, and nothing ever reminds the player about it.
 */
export function useVotePrompt() {
  return {
    current: computed(() => current.value),
    offerForMatch,
    offerPending,
    markShown,
    finish,
    close,
  }
}
