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

const ws = vi.hoisted(() => ({ handlers: new Map<string, (data: unknown) => void>() }))
vi.mock('@/composables/notification/notification.socket', () => ({
  onWsEvent: (event: string, handler: (data: unknown) => void) => {
    ws.handlers.set(event, handler)
    return () => ws.handlers.delete(event)
  },
}))

import ui from '@nuxt/ui/vue-plugin'
import { createMemoryHistory, createRouter } from 'vue-router'
import VotePrompt from '../VotePrompt.vue'
import { useVotePrompt } from '@/composables/votes/useVotePrompt'
import { acquireScreen, holdScreenWhile } from '@/composables/useScreenTakeover'
import { registerBottomNav } from '@/composables/ui/useBottomNav'

const prompt = (over: Partial<VotePromptData> = {}): VotePromptData => ({
  matchId: 'm1',
  tournamentId: 't1',
  expiresAt: new Date(Date.now() + 60 * 60_000),
  sides: [
    { position: 1, players: [{ id: 'me', displayName: 'Moi' }, { id: 'julie', displayName: 'Julie' }] },
    { position: 2, players: [{ id: 'paul', displayName: 'Paul' }, { id: 'marc', displayName: 'Marc' }] },
  ],
  mvpCandidateIds: ['julie', 'paul', 'marc'],
  fairPlayTargetIds: ['paul', 'marc'],
  ...over,
})

const i18n = createI18n({ legacy: false, locale: 'fr', fallbackLocale: 'fr', messages: { fr } })

const mounted: { unmount(): void }[] = []

const blank = { render: () => null }
function testRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/tournaments/:id', name: 'tournament-detail', component: blank },
      { path: '/tournaments/:id/:tab', name: 'tournament-tab', component: blank },
      { path: '/:p(.*)*', component: blank },
    ],
  })
}
let router = testRouter()

async function mountPrompt(
  data: VotePromptData | null,
  props: Record<string, unknown> = { idleMs: 7000 },
  at = '/tournaments/t1',
) {
  api.pendingPrompt.mockResolvedValue(data)
  router = testRouter()
  await router.push(at)
  const wrapper = mount(VotePrompt, {
    props: { settleMs: 0, thanksMs: 10, ...props },
    attachTo: document.body,
    global: {
      plugins: [
        i18n,
        ui,
        // The card reads the route, and "More options" is a ULink: both need a real router.
        router,
      ],
    },
  })
  mounted.push(wrapper)
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
    // One host only, as in the app: a leftover instance would close the next prompt.
    mounted.splice(0).forEach((w) => w.unmount())
    useVotePrompt().close()
    vi.useRealTimers()
    document.body.innerHTML = ''
  })

  it('asks for the MVP of the last match first, and records the prompt as shown', async () => {
    const wrapper = await mountPrompt(prompt())
    expect(wrapper.text()).toContain('Désigne le MVP de ton dernier match')
    expect(wrapper.text()).not.toMatch(/Victoire|Défaite/)
    expect(api.recordPrompt).toHaveBeenCalledWith('m1', 'expired')
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

  it('links to the match page for 👎 and tags, and closes', async () => {
    const wrapper = await mountPrompt(prompt({ mvpCandidateIds: [] }))
    const more = wrapper.get('[data-testid="vote-prompt-more"]')
    expect(more.attributes('href')).toBe('/matches/m1')
    await more.trigger('click')
    expect(wrapper.find('[data-testid="vote-prompt"]').exists()).toBe(false)
  })

  it('settles a closed card as dismissed, only once its "shown" record landed', async () => {
    let landShown!: () => void
    api.recordPrompt.mockImplementationOnce(() => new Promise<void>((r) => (landShown = r)))
    const wrapper = await mountPrompt(prompt())
    await wrapper.get('[data-testid="vote-prompt-close"]').trigger('click')
    await flushPromises()
    expect(api.recordPrompt).toHaveBeenCalledTimes(1)
    landShown()
    await flushPromises()
    expect(api.recordPrompt.mock.calls).toEqual([
      ['m1', 'expired'],
      ['m1', 'dismissed'],
    ])
  })

  it('settles an explicit skip as skipped, never as ignored', async () => {
    const wrapper = await mountPrompt(prompt({ fairPlayTargetIds: [] }))
    await wrapper.get('[data-testid="vote-prompt-skip"]').trigger('click')
    await flushPromises()
    expect(api.recordPrompt).toHaveBeenLastCalledWith('m1', 'skipped')
  })

  it('settles as voted once a vote went through, even if closed afterwards', async () => {
    const wrapper = await mountPrompt(prompt())
    await wrapper.get('[data-testid="vote-prompt-mvp-julie"]').trigger('click')
    await flushPromises()
    await wrapper.get('[data-testid="vote-prompt-close"]').trigger('click')
    await flushPromises()
    expect(api.recordPrompt).toHaveBeenLastCalledWith('m1', 'voted')
  })

  it('settles a card left alone as expired', async () => {
    await mountPrompt(prompt())
    await vi.advanceTimersByTimeAsync(7000)
    await flushPromises()
    expect(api.recordPrompt).toHaveBeenLastCalledWith('m1', 'expired')
    expect(api.recordPrompt).toHaveBeenCalledTimes(2)
  })

  it('drains its progress bar as the countdown runs', async () => {
    const wrapper = await mountPrompt(prompt())
    const value = () => Number(wrapper.get('[data-testid="vote-prompt-progress"] [role="progressbar"]').attributes('aria-valuenow'))
    const start = value()
    await vi.advanceTimersByTimeAsync(3500)
    expect(value()).toBeLessThan(start)
  })

  it('gives phones 12 s instead of 7', async () => {
    // jsdom reports a 0-wide screen: useViewport reads it as a phone.
    const wrapper = await mountPrompt(prompt(), {})
    await vi.advanceTimersByTimeAsync(7000)
    expect(wrapper.find('[data-testid="vote-prompt"]').exists()).toBe(true)
    await vi.advanceTimersByTimeAsync(5000)
    expect(wrapper.find('[data-testid="vote-prompt"]').exists()).toBe(false)
  })

  it('drops the countdown once past the MVP step', async () => {
    const wrapper = await mountPrompt(prompt())
    await wrapper.get('[data-testid="vote-prompt-skip"]').trigger('click')
    expect(wrapper.find('[data-testid="vote-prompt-progress"]').exists()).toBe(false)
    await vi.advanceTimersByTimeAsync(30_000)
    expect(wrapper.find('[data-testid="vote-prompt-thumbs-up"]').exists()).toBe(true)
  })

  it('keeps the countdown when fair-play is the only step', async () => {
    const wrapper = await mountPrompt(prompt({ mvpCandidateIds: [] }))
    expect(wrapper.find('[data-testid="vote-prompt-progress"]').exists()).toBe(true)
    await vi.advanceTimersByTimeAsync(7000)
    expect(wrapper.find('[data-testid="vote-prompt"]').exists()).toBe(false)
  })

  it('freezes for good at the first touch', async () => {
    const wrapper = await mountPrompt(prompt())
    await wrapper.get('[data-testid="vote-prompt"]').trigger('pointerdown')
    await vi.advanceTimersByTimeAsync(30_000)
    expect(wrapper.find('[data-testid="vote-prompt"]').exists()).toBe(true)
  })

  it('stops counting while the app is in the background', async () => {
    const wrapper = await mountPrompt(prompt())
    const state = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden')
    document.dispatchEvent(new Event('visibilitychange'))
    await vi.advanceTimersByTimeAsync(30_000)
    expect(wrapper.find('[data-testid="vote-prompt"]').exists()).toBe(true)
    state.mockReturnValue('visible')
    document.dispatchEvent(new Event('visibilitychange'))
    await vi.advanceTimersByTimeAsync(7000)
    expect(wrapper.find('[data-testid="vote-prompt"]').exists()).toBe(false)
    state.mockRestore()
  })

  it('carries the "match saved" line right after entering the match', async () => {
    api.pendingPrompt.mockResolvedValue(null)
    api.promptForMatch.mockResolvedValue(prompt())
    const wrapper = await mountPrompt(null)
    expect(await useVotePrompt().offerForMatch('m1')).toBe(true)
    await flushPromises()
    await vi.advanceTimersByTimeAsync(1)
    await flushPromises()
    expect(wrapper.get('[data-testid="vote-prompt-saved"]').text()).toContain('Match enregistré')
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

  it('pauses the 7 s countdown while hovered', async () => {
    const wrapper = await mountPrompt(prompt())
    await wrapper.get('[data-testid="vote-prompt"]').trigger('mouseenter')
    await vi.advanceTimersByTimeAsync(10_000)
    expect(wrapper.find('[data-testid="vote-prompt"]').exists()).toBe(true)
    await wrapper.get('[data-testid="vote-prompt"]').trigger('mouseleave')
    await vi.advanceTimersByTimeAsync(7000)
    expect(wrapper.find('[data-testid="vote-prompt"]').exists()).toBe(false)
  })

  it("waits off its tournament's page, and counts as shown only once on screen", async () => {
    const wrapper = await mountPrompt(prompt(), { idleMs: 7000 }, '/')
    expect(wrapper.find('[data-testid="vote-prompt"]').exists()).toBe(false)
    expect(api.recordPrompt).not.toHaveBeenCalled()

    await router.push('/tournaments/other')
    await flushPromises()
    expect(wrapper.find('[data-testid="vote-prompt"]').exists()).toBe(false)

    await router.push('/tournaments/t1/standings')
    await flushPromises()
    await vi.advanceTimersByTimeAsync(1)
    await flushPromises()
    expect(wrapper.find('[data-testid="vote-prompt"]').exists()).toBe(true)
    expect(api.recordPrompt).toHaveBeenCalledWith('m1', 'expired')
  })

  it('does not flash in while the tournament page is still finding out about an MMR reveal', async () => {
    const wrapper = await mountPrompt(prompt(), { idleMs: 7000, settleMs: 800 }, '/')
    // The page arrives and holds the screen while it loads its pending reveals.
    const release = acquireScreen()
    await router.push('/tournaments/t1')
    await flushPromises()
    await vi.advanceTimersByTimeAsync(2000)
    expect(wrapper.find('[data-testid="vote-prompt"]').exists()).toBe(false)
    release()
    await vi.advanceTimersByTimeAsync(500)
    expect(wrapper.find('[data-testid="vote-prompt"]').exists()).toBe(false)
    await vi.advanceTimersByTimeAsync(400)
    await flushPromises()
    expect(wrapper.find('[data-testid="vote-prompt"]').exists()).toBe(true)
  })

  it('drops a waiting prompt once the match is too old', async () => {
    const wrapper = await mountPrompt(prompt({ expiresAt: new Date(Date.now() + 60_000) }), { idleMs: 7000 }, '/')
    await vi.advanceTimersByTimeAsync(90_000)
    await router.push('/tournaments/t1')
    await flushPromises()
    expect(wrapper.find('[data-testid="vote-prompt"]').exists()).toBe(false)
    expect(useVotePrompt().current.value).toBeNull()
  })

  it('sits above a mobile bottom nav so the player can keep navigating', async () => {
    const nav = mount(defineComponent({ setup: () => (registerBottomNav(), () => null) }))
    const wrapper = await mountPrompt(prompt())
    expect(wrapper.get('[data-testid="vote-prompt"]').classes()).toContain('above-nav')
    nav.unmount()
    await flushPromises()
    expect(wrapper.get('[data-testid="vote-prompt"]').classes()).not.toContain('above-nav')
  })

  it('waits for a full-screen moment to end instead of dropping the prompt', async () => {
    const open = ref(true)
    mount(defineComponent({ setup: () => (holdScreenWhile(() => open.value), () => null) }))
    const wrapper = await mountPrompt(prompt())
    expect(wrapper.find('[data-testid="vote-prompt"]').exists()).toBe(false)
    open.value = false
    await vi.advanceTimersByTimeAsync(1)
    await flushPromises()
    expect(wrapper.find('[data-testid="vote-prompt"]').exists()).toBe(true)
  })

  it('asks as soon as a match notification lands while the app is open', async () => {
    await mountPrompt(null)
    api.pendingPrompt.mockClear()
    ws.handlers.get('new_notification')?.({ type: 'MATCH_MESSAGE' })
    await vi.advanceTimersByTimeAsync(2000)
    expect(api.pendingPrompt).not.toHaveBeenCalled()
    ws.handlers.get('new_notification')?.({ type: 'MATCH_CREATED' })
    await vi.advanceTimersByTimeAsync(2000)
    expect(api.pendingPrompt).toHaveBeenCalledTimes(1)
  })
})
