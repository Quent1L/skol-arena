import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createI18n } from 'vue-i18n'
import type { ClientMatchCard } from '@skol-arena/shared/types/index'

const list = vi.fn()

vi.mock('@/composables/match/match.api', () => ({ matchApi: { list: (...args: unknown[]) => list(...args) } }))
vi.mock('@vueuse/core', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@vueuse/core')>()),
  useInfiniteScroll: vi.fn(),
}))

const ws = vi.hoisted(() => ({ handlers: new Map<string, (data: unknown) => void>() }))
vi.mock('@/composables/notification/notification.socket', () => ({
  onWsEvent: (event: string, handler: (data: unknown) => void) => {
    ws.handlers.set(event, handler)
    return () => ws.handlers.delete(event)
  },
}))

import MatchList from '../MatchList.vue'

const i18n = createI18n({ legacy: false, locale: 'fr', missingWarn: false, fallbackWarn: false, messages: { fr: {} } })

function card(id: string): ClientMatchCard {
  return { id, playedAt: new Date(), sides: [] } as unknown as ClientMatchCard
}

function page(ids: string[], total = ids.length) {
  return { data: ids.map(card), total, hasMore: false }
}

function mountList(refreshKey = 0) {
  return mount(MatchList, {
    props: { tournamentId: 't1', refreshKey, scrollMode: 'none' as const },
    global: {
      plugins: [i18n],
      stubs: { MatchCard: true, PlayerPickerDialog: true, Icon: true, Button: true },
    },
  })
}

beforeEach(() => {
  setActivePinia(createPinia())
  list.mockReset()
  list.mockResolvedValue(page(['m1', 'm2']))
})

describe('MatchList — background refresh', () => {
  it('refetches the loaded range when the refresh key changes', async () => {
    const wrapper = mountList()
    await flushPromises()
    expect(list).toHaveBeenCalledTimes(1)

    list.mockResolvedValueOnce(page(['m3', 'm1', 'm2'], 3))
    await wrapper.setProps({ refreshKey: 1 })
    await flushPromises()

    expect(list).toHaveBeenCalledTimes(2)
    // The reader's place is kept: the range already on screen is refetched from the
    // top, never reset to a first page of `pageSize`.
    expect(list.mock.calls[1][0]).toMatchObject({ offset: 0, limit: 2 })
    expect(wrapper.findAllComponents({ name: 'MatchCard' })).toHaveLength(3)
  })

  it('does nothing when the list is still empty', async () => {
    list.mockResolvedValue(page([]))
    const wrapper = mountList()
    await flushPromises()
    expect(list).toHaveBeenCalledTimes(1)

    await wrapper.setProps({ refreshKey: 1 })
    await flushPromises()

    expect(list).toHaveBeenCalledTimes(1)
  })
})

describe('MatchList — live MVP', () => {
  it('swaps the MVP badge of a listed match without refetching', async () => {
    list.mockResolvedValue({
      data: [
        {
          id: 'm1',
          playedAt: new Date(),
          sides: [
            { position: 1, players: [{ id: 'p1', displayName: 'Paul', shortName: 'PA' }] },
            { position: 2, players: [{ id: 'p2', displayName: 'Marc', shortName: 'MA', isMvp: true }] },
          ],
        },
      ],
      total: 1,
      hasMore: false,
    })
    const wrapper = mountList()
    await flushPromises()

    ws.handlers.get('match_votes_updated')?.({ matchId: 'elsewhere', mvpPlayerIds: ['x'] })
    ws.handlers.get('match_votes_updated')?.({ matchId: 'm1', mvpPlayerIds: ['p1'] })
    await flushPromises()

    expect(list).toHaveBeenCalledTimes(1)
    const entry = wrapper.findComponent({ name: 'MatchCard' }).props('entry') as ClientMatchCard
    expect(entry.sides.flatMap((s) => s.players).filter((p) => p.isMvp).map((p) => p.id)).toEqual(['p1'])
  })
})
