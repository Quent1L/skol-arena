import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { nextTick, ref } from 'vue'
import { enableAutoUnmount } from '@vue/test-utils'
import { i18n } from '@/i18n'
import { mountWithPlugins } from '@/test-support/mount'
import RewindStat from '../RewindStat.vue'
import RewindTierBadge from '../RewindTierBadge.vue'
import RewindTapHint from '../RewindTapHint.vue'
import RewindCardShell from '../RewindCardShell.vue'
import AwardRow from '../AwardRow.vue'
import RelationRow from '../RelationRow.vue'
import TotalsCard from '../cards/TotalsCard.vue'
import { AWARD_STYLE } from '../award-display'

enableAutoUnmount(afterEach)

vi.mock('@/composables/ui/useCountUp', () => ({
  useCountUp: (target: { value: number }) => ({ value: ref(target.value), start: vi.fn() }),
}))
vi.mock('@/i18n/serverLabels', () => ({
  useServerLabels: () => ({ tierName: (tier: { name: string }) => `tier:${tier.name}` }),
}))

const global = { plugins: [i18n], stubs: { Transition: false } }

beforeEach(() => {
  i18n.global.locale.value = 'en'
})

describe('RewindStat', () => {
  it('wraps the value in its prefix and suffix, under its label', () => {
    const wrapper = mountWithPlugins(RewindStat, {
      props: { value: 12, label: 'Wins', prefix: '+', suffix: ' pts' },
    })

    expect(wrapper.text()).toContain('+12 pts')
    expect(wrapper.text()).toContain('Wins')
  })

  it('tints the value and shows the icon only when given one', () => {
    const plain = mountWithPlugins(RewindStat, { props: { value: 1, label: 'L' } })
    expect(plain.find('i').exists()).toBe(false)
    expect(plain.find('.text-white').exists()).toBe(true)

    const tinted = mountWithPlugins(RewindStat, {
      props: { value: 1, label: 'L', icon: 'fa fa-fire', valueClass: 'text-rose-400' },
    })
    expect(tinted.find('i.fa-fire.text-rose-400').exists()).toBe(true)
  })
})

describe('RewindTierBadge', () => {
  const tier = { name: 'gold', level: 3, iconClass: null } as never

  it('names the tier and uses the tier table for its colours', () => {
    const wrapper = mountWithPlugins(RewindTierBadge, { props: { tier } })

    expect(wrapper.text()).toBe('tier:gold')
    expect(wrapper.find('.bg-amber-500').exists()).toBe(true)
    expect(wrapper.find('span').classes()).toContain('text-amber-400')
    expect(wrapper.find('i.fa-star').exists()).toBe(true)
  })

  it('prefers the tier’s own icon and grows in the large size', () => {
    const wrapper = mountWithPlugins(RewindTierBadge, {
      props: { tier: { name: 'x', level: 1, iconClass: 'fa fa-bolt' } as never, size: 'lg' },
    })

    expect(wrapper.find('i.fa-bolt').exists()).toBe(true)
    expect(wrapper.find('.h-14.w-14').exists()).toBe(true)
  })
})

describe('RewindTapHint', () => {
  it('shows the translated hint only while visible', async () => {
    const wrapper = mountWithPlugins(RewindTapHint, { props: { visible: true }, global })
    expect(wrapper.text()).toContain(i18n.global.t('rewind.overlay.tapHint'))
    expect(wrapper.attributes('aria-hidden') ?? wrapper.find('[aria-hidden]').exists()).toBeTruthy()

    await wrapper.setProps({ visible: false })

    expect(wrapper.text()).toBe('')
  })
})

describe('RewindCardShell', () => {
  it('renders the heading, optional eyebrow and subtitle, and the slot', () => {
    const wrapper = mountWithPlugins(RewindCardShell, {
      props: { title: 'Title', eyebrow: 'Eyebrow', subtitle: 'Sub', eyebrowClass: 'custom' },
      slots: { default: '<i id="body" />' },
      global,
    })

    expect(wrapper.find('h2').text()).toBe('Title')
    expect(wrapper.find('span.custom').text()).toBe('Eyebrow')
    expect(wrapper.find('p').text()).toBe('Sub')
    expect(wrapper.find('#body').exists()).toBe(true)
  })

  it('leaves out the eyebrow and subtitle when absent', () => {
    const wrapper = mountWithPlugins(RewindCardShell, { props: { title: 'Only' }, global })

    expect(wrapper.find('span').exists()).toBe(false)
    expect(wrapper.find('p').exists()).toBe(false)
  })
})

describe('AwardRow', () => {
  const props = {
    label: 'King',
    playerName: 'Ann',
    value: 7,
    icon: 'fa fa-crown',
    accent: '#fbbf24',
  }

  it('shows the winner and the value with its detail', () => {
    const wrapper = mountWithPlugins(AwardRow, {
      props: { ...props, prefix: '+', suffix: '%', detail: 'in 3 matches' },
    })

    expect(wrapper.text()).toContain('Ann')
    expect(wrapper.text()).toContain('+7%')
    expect(wrapper.text()).toContain('in 3 matches')
    expect(wrapper.find('.ring-1').exists()).toBe(false)
  })

  it('highlights the viewer’s own award', () => {
    const wrapper = mountWithPlugins(AwardRow, { props: { ...props, isMine: true } })

    expect(wrapper.find('.ring-amber-400\\/40').exists()).toBe(true)
  })
})

describe('RelationRow', () => {
  it('shows the opponent, the record and the match count', () => {
    const wrapper = mountWithPlugins(RelationRow, {
      props: {
        label: 'Rival',
        icon: 'fa fa-fire',
        accent: 'text-rose-400',
        relation: { displayName: 'Bob', wins: 4, losses: 2, count: 6 } as never,
      },
      global,
    })

    expect(wrapper.text()).toContain('Bob')
    expect(wrapper.text()).toContain('4-2')
    expect(wrapper.text()).toContain(i18n.global.t('rewind.feats.matches', 6))
  })
})

describe('TotalsCard', () => {
  const player = {
    totals: { matchesPlayed: 10, wins: 6, draws: 1, losses: 3, winRate: 60 },
  } as never

  beforeEach(() => {
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => (cb(0), 1))
  })
  afterEach(() => vi.unstubAllGlobals())

  it('fills the win-rate bar once mounted', async () => {
    const wrapper = mountWithPlugins(TotalsCard, { props: { player }, global })
    await nextTick()

    expect(wrapper.text()).toContain('60 %')
    expect(wrapper.find('.bg-emerald-400.rounded-full').attributes('style')).toContain('width: 60%')
  })

  it('shows the draw tile only for a discipline that allows draws', async () => {
    const wrapper = mountWithPlugins(TotalsCard, { props: { player }, global })
    expect(wrapper.find('.grid-cols-3').exists()).toBe(true)

    await wrapper.setProps({ allowDraw: false })

    expect(wrapper.find('.grid-cols-2').exists()).toBe(true)
    expect(wrapper.find('.grid-cols-3').exists()).toBe(false)
  })
})

describe('AWARD_STYLE', () => {
  it('gives every award an icon and a colour', () => {
    for (const [key, style] of Object.entries(AWARD_STYLE)) {
      expect(style.icon, key).toMatch(/^fa fa-/)
      expect(style.accent, key).toMatch(/^#[0-9a-f]{6}$/)
    }
  })
})
