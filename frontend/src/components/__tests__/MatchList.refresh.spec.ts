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
    expect(wrapper.findAllComponents({ name: 'MatchCard' }).length).toBe(3)
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
