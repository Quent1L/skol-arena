import { describe, it, expect, vi, beforeEach } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { ref } from 'vue'
import type { MatchVotes as MatchVotesData } from '@skol-arena/shared/types/index'
import MatchVotes from '../MatchVotes.vue'

vi.mock('vue-i18n', async () => (await import('@/test-support/mock-modules')).i18nEchoMock())
vi.mock('@/composables/notification/notification.socket', () => ({ onWsEvent: () => () => {} }))

const route = vi.hoisted(() => ({ hash: '' }))
vi.mock('vue-router', () => ({ useRoute: () => route }))

const votes = ref<MatchVotesData | null>(null)
vi.mock('@/composables/votes/votes.service', () => ({
  useMatchVotes: () => ({
    votes,
    saving: ref(false),
    savedAt: ref(0),
    load: vi.fn(),
  }),
}))

const scrollIntoView = vi.fn()

function mountVotes() {
  return mount(MatchVotes, {
    props: { matchId: 'm1', sides: [] },
    attachTo: document.body,
    global: {
      // The real panel carries the anchor: the stub stands in with it.
      stubs: { FairPlaySection: { template: '<section id="fair-play" />' }, MvpSection: true },
    },
  })
}

describe('MatchVotes', () => {
  beforeEach(() => {
    votes.value = null
    scrollIntoView.mockClear()
    Element.prototype.scrollIntoView = scrollIntoView
  })

  it('scrolls to the fair-play panel once loaded when the URL points at it', async () => {
    route.hash = '#fair-play'
    const wrapper = mountVotes()
    votes.value = { isOpen: true, fairPlay: {}, mvp: null } as unknown as MatchVotesData
    await flushPromises()
    expect(scrollIntoView).toHaveBeenCalledTimes(1)

    // A refetch (someone else voted) does not yank the page back.
    votes.value = { isOpen: true, fairPlay: {}, mvp: null } as unknown as MatchVotesData
    await flushPromises()
    expect(scrollIntoView).toHaveBeenCalledTimes(1)
    wrapper.unmount()
  })

  it('leaves the scroll alone on a plain visit', async () => {
    route.hash = ''
    const wrapper = mountVotes()
    votes.value = { isOpen: true, fairPlay: {}, mvp: null } as unknown as MatchVotesData
    await flushPromises()
    expect(scrollIntoView).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('drops both panels once voting has closed', async () => {
    route.hash = ''
    const wrapper = mountVotes()
    votes.value = { isOpen: false, fairPlay: {}, mvp: {} } as unknown as MatchVotesData
    await flushPromises()
    expect(wrapper.find('#fair-play').exists()).toBe(false)
    wrapper.unmount()
  })
})
