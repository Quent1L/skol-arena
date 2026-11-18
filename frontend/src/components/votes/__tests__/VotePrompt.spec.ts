import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { defineComponent, ref } from 'vue'
import { createI18n } from 'vue-i18n'
import fr from '@/i18n/messages/fr.json'
import type { VotePrompt as VotePromptData } from '@skol-arena/shared/types/index'

const api = vi.hoisted(() => ({
  pendingPrompt: vi.fn(),
  promptForMatch: vi.fn(),
  recordPrompt: vi.fn(async () => {}),
  castMvp: vi.fn(async () => ({})),
  castFairPlay: vi.fn(async () => ({})),
  castFairPlayTeamUp: vi.fn(async () => ({})),
}))
vi.mock('@/composables/votes/votes.api', () => ({ votesApi: api }))

import ui from '@nuxt/ui/vue-plugin'
import VotePrompt from '../VotePrompt.vue'
import { useVotePrompt } from '@/composables/votes/useVotePrompt'
import { holdScreenWhile } from '@/composables/useScreenTakeover'

const prompt = (over: Partial<VotePromptData> = {}): VotePromptData => ({
  matchId: 'm1',
  tournamentId: 't1',
  meId: 'me',
  myPosition: 1,
  winnerPosition: 2,
  sides: [
    { position: 1, players: [{ id: 'me', displayName: 'Moi' }, { id: 'julie', displayName: 'Julie' }] },
    { position: 2, players: [{ id: 'paul', displayName: 'Paul' }, { id: 'marc', displayName: 'Marc' }] },
  ],
  mvpCandidateIds: ['julie', 'paul', 'marc'],
  fairPlayTargetIds: ['paul', 'marc'],
  ...over,
})

const i18n = createI18n({ legacy: false, locale: 'fr', fallbackLocale: 'fr', messages: { fr } })

async function mountPrompt(data: VotePromptData | null) {
  api.pendingPrompt.mockResolvedValue(data)
  const wrapper = mount(VotePrompt, {
    props: { settleMs: 0, thanksMs: 10 },
    attachTo: document.body,
    global: { plugins: [i18n, ui] },
  })
  await flushPromises()
  await vi.advanceTimersByTimeAsync(1)
  await flushPromises()
  return wrapper
}

describe('VotePrompt', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    Object.values(api).forEach((fn) => fn.mockClear())
  })

  afterEach(() => {
    useVotePrompt().close()
    vi.useRealTimers()
    document.body.innerHTML = ''
  })

  it('shows the match line, records the prompt as shown, and asks MVP first', async () => {
    const wrapper = await mountPrompt(prompt())
    expect(wrapper.get('[data-testid="vote-prompt-info"]').text()).toContain('Toi & Julie vs Paul & Marc · Défaite')
    expect(api.recordPrompt).toHaveBeenCalledWith('m1', 'expired')
    expect(wrapper.text()).toContain('Ton MVP ?')
    expect(wrapper.html()).not.toContain('thumbs-down')
  })

  it('goes MVP → fair-play 👍 for the whole team → thanks', async () => {
    const wrapper = await mountPrompt(prompt())
    await wrapper.get('[data-testid="vote-prompt-mvp-julie"]').trigger('click')
    await flushPromises()
    expect(api.castMvp).toHaveBeenCalledWith('m1', 'julie')
    expect(wrapper.text()).toContain("fair-play de l'équipe adverse")
    await wrapper.get('[data-testid="vote-prompt-thumbs-up"]').trigger('click')
    await flushPromises()
    expect(api.castFairPlayTeamUp).toHaveBeenCalledWith('m1')
    expect(wrapper.text()).toContain('Merci ✓')
    await vi.advanceTimersByTimeAsync(20)
    expect(wrapper.find('[data-testid="vote-prompt"]').exists()).toBe(false)
  })

  it('skips straight to a single opponent in a 1v1', async () => {
    const wrapper = await mountPrompt(
      prompt({ mvpCandidateIds: [], fairPlayTargetIds: ['paul'], sides: prompt().sides }),
    )
    expect(wrapper.text()).toContain('fair-play de Paul')
    await wrapper.get('[data-testid="vote-prompt-thumbs-up"]').trigger('click')
    await flushPromises()
    expect(api.castFairPlay).toHaveBeenCalledWith('m1', 'paul', { value: 'up' })
  })

  it('"Passer" moves on to fair-play without voting MVP', async () => {
    const wrapper = await mountPrompt(prompt())
    await wrapper.get('[data-testid="vote-prompt-skip"]').trigger('click')
    expect(api.castMvp).not.toHaveBeenCalled()
    expect(wrapper.find('[data-testid="vote-prompt-thumbs-up"]').exists()).toBe(true)
  })

  it('closes on its own after 7 s without interaction', async () => {
    const wrapper = await mountPrompt(prompt())
    await vi.advanceTimersByTimeAsync(7000)
    expect(wrapper.find('[data-testid="vote-prompt"]').exists()).toBe(false)
  })

  it('is not offered while a full-screen moment plays', async () => {
    const open = ref(true)
    mount(defineComponent({ setup: () => (holdScreenWhile(() => open.value), () => null) }))
    await mountPrompt(prompt())
    expect(api.pendingPrompt).not.toHaveBeenCalled()
    open.value = false
  })
})
