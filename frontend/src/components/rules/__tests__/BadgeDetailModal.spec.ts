import { describe, it, expect, vi } from 'vitest'
import { h } from 'vue'
import { flushPromises } from '@vue/test-utils'
import type { AvailableBadge, BadgeHolder } from '@skol-arena/shared/types/index'
import { mountWithUi } from '@/test-support/mount'
import BadgeDetailModal from '../BadgeDetailModal.vue'

vi.mock('vue-i18n', async () => (await import('@/test-support/mock-modules')).i18nEchoMock())

const alice: BadgeHolder = { id: 'p-1', displayName: 'Alice', shortName: 'ALI', count: 2, earnedHere: true }
const bob: BadgeHolder = { id: 'p-2', displayName: 'Bob', shortName: 'BOB', count: 1, earnedHere: false }

function badge(holders: BadgeHolder[]): AvailableBadge {
  return {
    ruleId: 'rule-1',
    icon: 'fa fa-crosshairs',
    label: 'Sniper',
    description: 'Win ten matches without conceding a single point in any of them',
    recurrence: 'per_season',
    scope: 'global',
    holders,
  }
}

async function open(holders: BadgeHolder[]) {
  const wrapper = mountWithUi(BadgeDetailModal, {
    props: { badge: badge(holders), tournamentId: 't-1' },
    slots: { default: () => h('button', { type: 'button' }, 'tile') },
  })
  await wrapper.find('button').trigger('click')
  await flushPromises()
  return wrapper
}

// The modal teleports to body: query the document, not the wrapper.
const dialog = () => document.body.querySelector('[role="dialog"]')!
const rows = () => [...dialog().querySelectorAll('li')]

describe('BadgeDetailModal', () => {
  it('opens on the tile with the full description', async () => {
    const wrapper = await open([alice])

    expect(dialog().textContent).toContain('Sniper')
    expect(dialog().textContent).toContain('Win ten matches without conceding a single point in any of them')
    wrapper.unmount()
  })

  it('lists the holders with their award count', async () => {
    const wrapper = await open([alice, bob])

    expect(rows()).toHaveLength(2)
    expect(rows()[0]!.textContent).toContain('Alice')
    expect(rows()[0]!.textContent).toContain('badgeDetail.times#2')
    expect(rows()[0]!.textContent).toContain('badgeDetail.thisSeason')
    expect(rows()[1]!.textContent).toContain('badgeDetail.times#1')
    expect(rows()[1]!.textContent).not.toContain('badgeDetail.thisSeason')
    wrapper.unmount()
  })

  it('still opens when nobody holds the badge', async () => {
    const wrapper = await open([])

    expect(rows()).toHaveLength(0)
    expect(dialog().textContent).toContain('badgeDetail.noHolder')
    wrapper.unmount()
  })
})
