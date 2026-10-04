import { describe, it, expect, vi } from 'vitest'
import type { MatchSideInput } from '@skol-arena/shared/types/index'
import { mountWithPrime } from '@/test-support/mount'
import CompositionStep from '../CompositionStep.vue'
import { DUEL_TAPS } from '@/composables/match/useComposeEasterEggs'

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

describe('CompositionStep duel hint', () => {
  it('warns on the button whose next tap plays the overlay', async () => {
    const wrapper = mountStep({ isRanked: true, standings })
    const random = wrapper.find('[data-testid="compose-random"]')
    const balanced = wrapper.find('[data-testid="compose-balanced"]')

    for (let i = 0; i < DUEL_TAPS - 1; i += 1) {
      expect(wrapper.find('[data-testid="compose-duel-hint"]').exists()).toBe(false)
      await (i % 2 === 0 ? random : balanced).trigger('click')
    }

    expect(wrapper.find('[data-testid="compose-duel-hint"]').exists()).toBe(true)
    // An odd number of taps starting on random ends on random: balanced fires next.
    expect(balanced.classes()).toContain('animate-pulse')
    expect(random.classes()).not.toContain('animate-pulse')
  })
})

describe('CompositionStep settled balance', () => {
  // {p1,p2} vs {p3,p4} is the one fairest line-up.
  const uneven = {
    p1: { mmr: 1600, isPlacement: false },
    p2: { mmr: 1400, isPlacement: false },
    p3: { mmr: 1550, isPlacement: false },
    p4: { mmr: 1450, isPlacement: false },
  }
  const settled = '[data-testid="compose-balance-settled"]'

  it('says so once the only fair line-up is in place, and keeps it on a new tap', async () => {
    const wrapper = mountStep({
      isRanked: true,
      standings: uneven,
      sides: [
        { position: 1, playerIds: ['p1', 'p3'] },
        { position: 2, playerIds: ['p2', 'p4'] },
      ],
    })
    const balanced = wrapper.find('[data-testid="compose-balanced"]')
    expect(wrapper.find(settled).exists()).toBe(false)

    await balanced.trigger('click')
    const first = lastSides(wrapper)
    expect(wrapper.find(settled).exists()).toBe(true)

    await balanced.trigger('click')
    expect(lastSides(wrapper)).toEqual(first)
    expect(balanced.attributes('disabled')).toBeUndefined()
  })

  it('stays silent while several line-ups are as fair', async () => {
    const wrapper = mountStep({ isRanked: true, standings })

    await wrapper.find('[data-testid="compose-balanced"]').trigger('click')

    expect(wrapper.find(settled).exists()).toBe(false)
  })
})
