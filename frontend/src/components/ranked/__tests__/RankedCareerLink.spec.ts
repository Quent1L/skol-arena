import { describe, it, expect, vi } from 'vitest'
import { RouterLinkStub } from '@vue/test-utils'
import { mountWithPlugins } from '@/test-support/mount'
import { CAREER_ANCHOR } from '@/composables/ranked/career'
import RankedCareerLink from '../RankedCareerLink.vue'

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (key: string) => key }),
  createI18n: () => ({ global: { t: (key: string) => key }, install: () => {} }),
}))

function mountLink(playerId = 'p1') {
  return mountWithPlugins(RankedCareerLink, {
    props: { playerId },
    global: { stubs: { RouterLink: RouterLinkStub } },
  })
}

describe('RankedCareerLink', () => {
  it('points at the player stats page', () => {
    const to = mountLink('p1').findComponent(RouterLinkStub).props('to') as {
      path: string
      hash: string
    }

    expect(to.path).toBe('/players/p1')
  })

  it('targets the career card, so the page lands on it', () => {
    const to = mountLink().findComponent(RouterLinkStub).props('to') as { hash: string }

    expect(to.hash).toBe(`#${CAREER_ANCHOR}`)
  })

  // The page opens on the ranked runs of this discipline, not on the whole record.
  it('scopes the stats page to ranked', () => {
    const to = mountLink().findComponent(RouterLinkStub).props('to') as {
      query: Record<string, string>
    }

    expect(to.query.mode).toBe('ranked')
  })

  it('carries the discipline when the season has one', () => {
    const wrapper = mountWithPlugins(RankedCareerLink, {
      props: { playerId: 'p1', disciplineId: 'disc-1' },
      global: { stubs: { RouterLink: RouterLinkStub } },
    })
    const to = wrapper.findComponent(RouterLinkStub).props('to') as {
      query: Record<string, string>
    }

    expect(to.query.disciplineId).toBe('disc-1')
  })

  it('omits the discipline rather than sending an empty filter', () => {
    const to = mountLink().findComponent(RouterLinkStub).props('to') as {
      query: Record<string, string>
    }

    expect(to.query).not.toHaveProperty('disciplineId')
  })

  it('is labelled, not just an icon', () => {
    expect(mountLink().text()).toContain('playerRankedCareer.viewHistory')
  })
})

// The tab always shows the signed-in player their own record; a player page usually
// does not, and "mon historique" on someone else's page would be a lie.
describe('RankedCareerLink label', () => {
  function label(props: Record<string, unknown>) {
    return mountWithPlugins(RankedCareerLink, {
      props: { playerId: 'p1', ...props },
      global: { stubs: { RouterLink: RouterLinkStub } },
    }).text()
  }

  it('speaks in the first person on your own profile', () => {
    expect(label({ own: true })).toContain('playerRankedCareer.viewHistoryOwn')
  })

  it('stays neutral on someone else’s', () => {
    expect(label({})).toContain('playerRankedCareer.viewHistory')
    expect(label({})).not.toContain('playerRankedCareer.viewHistoryOwn')
  })
})
