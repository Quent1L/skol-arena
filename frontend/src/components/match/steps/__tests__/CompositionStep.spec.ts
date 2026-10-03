import { describe, it, expect, vi } from 'vitest'
import type { MatchSideInput } from '@skol-arena/shared/types/index'
import { mountWithPrime } from '@/test-support/mount'
import CompositionStep from '../CompositionStep.vue'

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (key: string) => key }),
}))

vi.mock('@/composables/match/match.service', () => ({
  useMatchService: () => ({ validateMatchSides: vi.fn() }),
}))

const ids = ['p1', 'p2', 'p3', 'p4']
const standings = Object.fromEntries(ids.map((id) => [id, { mmr: 1500, isPlacement: false }]))

function mountStep(props: Record<string, unknown> = {}) {
  return mountWithPrime(CompositionStep, {
    props: {
      tournamentId: 't1',
      playerNames: { p1: 'Ann', p2: 'Bob', p3: 'Cid', p4: 'Dan' },
      sides: [{ position: 1 }, { position: 2 }],
      allPlayerIds: ids,
      hideNavigation: true,
      ...props,
    },
  })
}

function lastSides(wrapper: ReturnType<typeof mountStep>) {
  const emitted = wrapper.emitted('update:sides')!
  return emitted[emitted.length - 1][0] as MatchSideInput[]
}

describe('CompositionStep auto-composition', () => {
  it('offers only the random line-up outside ranked', () => {
    const wrapper = mountStep({ standings })

    expect(wrapper.find('[data-testid="compose-random"]').text()).toContain(
      'compositionStep.randomOnly',
    )
    expect(wrapper.find('[data-testid="compose-balanced"]').exists()).toBe(false)
  })

  it('offers the balanced line-up in ranked once ratings are loaded', async () => {
    const wrapper = mountStep({ isRanked: true })
    expect(wrapper.find('[data-testid="compose-balanced"]').exists()).toBe(false)

    await wrapper.setProps({ standings })
    expect(wrapper.find('[data-testid="compose-balanced"]').exists()).toBe(true)
  })

  it('hides the buttons when there are only two players', () => {
    const wrapper = mountStep({ allPlayerIds: ['p1', 'p2'] })

    expect(wrapper.find('[data-testid="compose-random"]').exists()).toBe(false)
  })

  it('applies a random line-up with every player', async () => {
    const wrapper = mountStep()

    await wrapper.find('[data-testid="compose-random"]').trigger('click')
    const composed = lastSides(wrapper)
    expect(composed.flatMap((s) => s.playerIds ?? []).sort()).toEqual(ids)
    expect(composed[0].playerIds).toHaveLength(2)
  })
})
