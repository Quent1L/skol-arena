import { describe, it, expect, vi } from 'vitest'
import { mountWithUi } from '@/test-support/mount'
import RankingInput from '../RankingInput.vue'

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (key: string) => key }),
}))

const sides = [
  { position: 1, playerIds: ['a'] },
  { position: 2, playerIds: ['b'] },
  { position: 3, playerIds: ['c'] },
]

function mountInput(props: Record<string, unknown> = {}) {
  return mountWithUi(RankingInput, {
    props: {
      sides,
      playerNames: { a: 'Ann', b: 'Bob', c: 'Cid' },
      ranks: {},
      scores: {},
      scoreEnabled: false,
      ...props,
    },
  })
}

function lastRanks(wrapper: ReturnType<typeof mountInput>) {
  const emitted = wrapper.findComponent(RankingInput).emitted('update:ranks')!
  return emitted[emitted.length - 1][0]
}

describe('RankingInput', () => {
  it('starts from the side order when there are no scores', () => {
    const wrapper = mountInput()

    expect(lastRanks(wrapper)).toEqual({ 1: 1, 2: 2, 3: 3 })
  })

  it('starts from the scores when the competition keeps them', () => {
    const wrapper = mountInput({ scoreEnabled: true, scores: { 1: 2, 2: 7, 3: 2 } })

    expect(lastRanks(wrapper)).toEqual({ 1: 2, 2: 1, 3: 2 })
  })

  it('ranks from the score just typed, before the parent hands the scores back', async () => {
    // A bound parent that has not re-rendered yet: the scores prop still reads {}.
    const wrapper = mountInput({ scoreEnabled: true, scores: {}, 'onUpdate:scores': () => {} })

    const inputs = wrapper.findAllComponents({ name: 'InputNumber' })
    inputs[1].vm.$emit('update:modelValue', 7)
    await wrapper.vm.$nextTick()

    expect(lastRanks(wrapper)).toEqual({ 1: 2, 2: 1, 3: 2 })
  })

  it('lists the sides in the order of an existing ranking', () => {
    const wrapper = mountInput({ ranks: { 1: 3, 2: 1, 3: 2 } })

    const places = wrapper.findAll('[data-testid="ranking-place"]').map((p) => p.text())
    expect(places).toEqual(['1', '2', '3'])
    expect(wrapper.findAll('[data-testid="ranking-row"]')[0].text()).toContain('Bob')
  })

  it('ties a side with the one above it', async () => {
    const wrapper = mountInput()

    await wrapper.findAll('[data-testid="ranking-tie"]')[0].trigger('click')

    expect(lastRanks(wrapper)).toEqual({ 1: 1, 2: 1, 3: 3 })
  })

  it('offers no tie on the first side', () => {
    const wrapper = mountInput()

    expect(wrapper.findAll('[data-testid="ranking-tie"]')).toHaveLength(2)
  })
})
