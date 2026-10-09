import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createI18n } from 'vue-i18n'
import { nextTick, ref } from 'vue'

import fr from '@/i18n/messages/fr.json'
import { mountWithPlugins } from '@/test-support/mount'
import MatchMessageThread from '../MatchMessageThread.vue'
import type { ClientMatchMessage } from '@skol-arena/shared/types/index'

const messages = ref<ClientMatchMessage[]>([])
const post = vi.fn()

vi.mock('@/composables/match/match-message.service', () => ({
  useMatchMessageService: () => ({
    messages,
    loading: ref(false),
    posting: ref(false),
    load: vi.fn(),
    post,
    subscribe: () => () => undefined,
  }),
}))

function makeMessage(over: Partial<ClientMatchMessage> = {}): ClientMatchMessage {
  return {
    id: 'msg-1',
    matchId: 'm-1',
    kind: 'user',
    body: 'le score est faux',
    translationParams: null,
    createdAt: new Date('2026-06-01T15:00:00Z'),
    author: { id: 'p1', displayName: 'Toto' },
    ...over,
  }
}

function mountThread(thread: ClientMatchMessage[], canPost = true) {
  messages.value = thread
  const i18n = createI18n({ legacy: false, locale: 'fr', fallbackLocale: 'fr', messages: { fr } })
  return mountWithPlugins(MatchMessageThread, {
    props: { matchId: 'm-1', canPost },
    global: { plugins: [i18n] },
  })
}

beforeEach(() => {
  post.mockReset()
})

describe('MatchMessageThread', () => {
  it('renders a user message with its author', async () => {
    const wrapper = mountThread([makeMessage()])
    await nextTick()

    expect(wrapper.text()).toContain('Toto')
    expect(wrapper.text()).toContain('le score est faux')
  })

  it('renders message bodies as text, never as markup', async () => {
    const wrapper = mountThread([
      makeMessage({ body: '<script>alert(1)</script><img src=x onerror=alert(1)>' }),
    ])
    await nextTick()

    expect(wrapper.find('img').exists()).toBe(false)
    expect(wrapper.text()).toContain('<script>alert(1)</script>')
  })

  it('translates a system message from its key and params', async () => {
    const wrapper = mountThread([
      makeMessage({
        id: 'msg-2',
        kind: 'system',
        body: 'matchMessages.RESULT_REVISED',
        translationParams: {
          authorName: 'Toto',
          previousScore: '3 - 1',
          newScore: '2 - 5',
        },
        author: null,
      }),
    ])
    await nextTick()

    expect(wrapper.text()).toContain('Toto a corrigé le résultat : 3 - 1 → 2 - 5')
    // An event carries its own timestamp, like a message header does
    expect(wrapper.text()).toMatch(/01\/06\/2026\s+\d{2}:\d{2}/)
  })

  it('counts what people said, not what the match did', async () => {
    const wrapper = mountThread([
      makeMessage({ id: 'm-user' }),
      makeMessage({
        id: 'm-sys',
        kind: 'system',
        body: 'matchMessages.MATCH_FINALIZED',
        author: null,
      }),
    ])
    await nextTick()

    const badge = wrapper.find('.tabular-nums')
    expect(badge.text()).toBe('1')
  })

  it('offers the composer only when the thread accepts new messages', async () => {
    const open = mountThread([], true)
    await nextTick()
    expect(open.find('.composer-trigger').exists()).toBe(true)

    const closed = mountThread([], false)
    await nextTick()
    expect(closed.find('.composer-trigger').exists()).toBe(false)
    expect(closed.find('#matchMessageBody').exists()).toBe(false)
  })

  it('keeps the input collapsed until the player asks to write', async () => {
    const wrapper = mountThread([], true)
    await nextTick()
    expect(wrapper.find('#matchMessageBody').exists()).toBe(false)

    await wrapper.find('.composer-trigger').trigger('click')
    await nextTick()

    expect(wrapper.find('#matchMessageBody').exists()).toBe(true)
    expect(wrapper.find('.composer-trigger').exists()).toBe(false)
  })

  it('discards the draft and collapses on cancel', async () => {
    const wrapper = mountThread([], true)
    await nextTick()
    await wrapper.find('.composer-trigger').trigger('click')
    await nextTick()
    await wrapper.find('#matchMessageBody').setValue('oops')

    const cancel = wrapper.findAll('button').find((b) => b.text().includes(fr.common.cancel))
    await cancel!.trigger('click')
    await nextTick()

    expect(post).not.toHaveBeenCalled()
    expect(wrapper.find('.composer-trigger').exists()).toBe(true)

    // Re-opening starts from a clean draft
    await wrapper.find('.composer-trigger').trigger('click')
    await nextTick()
    expect((wrapper.find('#matchMessageBody').element as HTMLTextAreaElement).value).toBe('')
  })

  it('sends the drafted message and collapses again', async () => {
    const wrapper = mountThread([], true)
    await nextTick()
    await wrapper.find('.composer-trigger').trigger('click')
    await nextTick()

    await wrapper.find('#matchMessageBody').setValue('fixed score?')
    await wrapper.findAll('button').at(-1)!.trigger('click')
    await nextTick()

    expect(post).toHaveBeenCalledWith('m-1', 'fixed score?')
    expect(wrapper.find('.composer-trigger').exists()).toBe(true)
  })
})
