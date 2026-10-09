import { describe, it, expect, vi } from 'vitest'
import { mountWithPlugins } from '@/test-support/mount'
import TopPlayersCard, { type TopPlayerItem } from '../TopPlayersCard.vue'

vi.mock('vue-i18n', () => ({
  useI18n: () => ({
    t: (key: string, params?: { count?: number }) => (params ? `${key}:${params.count}` : key),
  }),
}))

function item(overrides: Partial<TopPlayerItem> = {}): TopPlayerItem {
  return {
    id: 'p1',
    players: [{ id: 'p1', displayName: 'Thomas', shortName: 'THO' }],
    winRate: 75,
    score: 2.6,
    subLabel: '12 matchs · 9V 3D',
    rank: 1,
    tiedCount: 1,
    ...overrides,
  }
}

function mountCard(items: TopPlayerItem[], props: Record<string, unknown> = {}) {
  return mountWithPlugins(TopPlayersCard, {
    props: {
      title: 'Best teams',
      icon: 'fa fa-trophy',
      iconClass: 'text-yellow-500',
      tooltip: 'ranked on the weighted rate',
      barClass: 'bg-yellow-500',
      items,
      ...props,
    },
  })
}

describe('TopPlayersCard', () => {
  it('shows the raw win rate next to the sample it was drawn from', () => {
    const wrapper = mountCard([item()])

    expect(wrapper.text()).toContain('75 %')
    expect(wrapper.text()).toContain('12 matchs · 9V 3D')
    expect(wrapper.text()).toContain('Thomas')
  })

  it('sizes the bars on the ranking score, not on the percentage beside them', () => {
    // Second row has the better raw rate; the ranking — and so the bar — says otherwise.
    const wrapper = mountCard([
      item(),
      item({ id: 'p2', winRate: 100, score: 1.3, rank: 2, players: [] }),
    ])

    const bars = wrapper.findAll('[data-test="stat-leader-row"] .h-full')
    expect(bars[0].attributes('style')).toContain('width: 100%')
    expect(bars[1].attributes('style')).toContain('width: 50%')
  })

  it('warns when the ranking had to drop its own threshold', () => {
    expect(mountCard([item()]).find('[data-test="low-sample-badge"]').exists()).toBe(false)
    expect(
      mountCard([item()], { isLowSample: true }).find('[data-test="low-sample-badge"]').exists(),
    ).toBe(true)
  })

  it('flags once per group the entries no criterion separates', () => {
    const wrapper = mountCard([
      item({ id: 'p1', rank: 1, tiedCount: 2 }),
      item({ id: 'p2', rank: 1, tiedCount: 2 }),
      item({ id: 'p3', rank: 3, tiedCount: 1 }),
    ])

    expect(wrapper.findAll('[data-test="ex-aequo"]')).toHaveLength(1)
  })
})
