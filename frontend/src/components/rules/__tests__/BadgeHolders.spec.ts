import { describe, it, expect, vi } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import type { BadgeHolder } from '@skol-arena/shared/types/index'
import { mountWithUi } from '@/test-support/mount'
import BadgeHolders from '../BadgeHolders.vue'

vi.mock('vue-i18n', async () => (await import('@/test-support/mock-modules')).i18nEchoMock())

const alice: BadgeHolder = { id: 'p-1', displayName: 'Alice', shortName: 'ALI', count: 2, earnedHere: true }
const bob: BadgeHolder = { id: 'p-2', displayName: 'Bob', shortName: 'BOB', count: 1, earnedHere: false }

function mountHolders(holders: BadgeHolder[]) {
  return mountWithUi(BadgeHolders, { props: { holders, badgeLabel: 'Sniper', tournamentId: 't-1' } })
}

// The modal teleports to body: query the document, not the wrapper.
const rows = () => [...document.body.querySelectorAll('[role="dialog"] li')]

describe('BadgeHolders', () => {
  it('shows the avatar stack with the number of holders', () => {
    const wrapper = mountHolders([alice, bob])

    expect(wrapper.text()).toContain('badgeHolders.count#2')
    wrapper.unmount()
  })

  it('opens the list of holders with their award count on click', async () => {
    const wrapper = mountHolders([alice, bob])

    await wrapper.find('button').trigger('click')
    await flushPromises()

    expect(rows()).toHaveLength(2)
    expect(rows()[0]!.textContent).toContain('Alice')
    expect(rows()[0]!.textContent).toContain('badgeHolders.times#2')
    expect(rows()[0]!.textContent).toContain('badgeHolders.thisSeason')
    expect(rows()[1]!.textContent).toContain('badgeHolders.times#1')
    expect(rows()[1]!.textContent).not.toContain('badgeHolders.thisSeason')
    wrapper.unmount()
  })

  it('renders nothing when nobody holds the badge', () => {
    const wrapper = mountHolders([])

    expect(wrapper.find('button').exists()).toBe(false)
    wrapper.unmount()
  })
})
