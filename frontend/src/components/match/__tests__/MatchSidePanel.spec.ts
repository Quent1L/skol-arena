import { describe, it, expect } from 'vitest'
import { createI18n } from 'vue-i18n'
import { mount } from '@vue/test-utils'
import { RouterLinkStub } from '@vue/test-utils'

import fr from '@/i18n/messages/fr.json'
import type { MatchDetailSide } from '@skol-arena/shared/types/index'
import MatchSidePanel from '../MatchSidePanel.vue'
import type { ConfirmationStatus } from '@/composables/match/match-confirmation-status'

function mountPanel(over: Record<string, unknown> = {}) {
  const side: MatchDetailSide = {
    position: 1,
    score: 3,
    pointsAwarded: 0,
    isWinner: true,
    entryId: 'e-1',
    entryName: null,
    teamId: null,
    players: [
      { id: 'p1', displayName: 'Alexandre Lefebvre', shortName: 'AL', effectivePointsAwarded: 3 },
      { id: 'p2', displayName: 'Bob', shortName: 'BO', effectivePointsAwarded: 3 },
    ],
  }

  const i18n = createI18n({ legacy: false, locale: 'fr', fallbackLocale: 'fr', messages: { fr } })
  return mount(MatchSidePanel, {
    props: { side, fallbackName: 'Team A', isFinalized: false, ...over },
    global: { plugins: [i18n], stubs: { RouterLink: RouterLinkStub } },
  })
}

describe('MatchSidePanel player line', () => {
  /**
   * Regression guard: the line used to be flex-wrap with a name that could not shrink,
   * so a long name pushed the validation marker onto its own line on mobile.
   */
  it('keeps every badge on the name line and lets only the name shrink', () => {
    const statuses = new Map<string, ConfirmationStatus>([
      ['p1', 'pending'],
      ['p2', 'confirmed'],
    ])
    const wrapper = mountPanel({ confirmationStatuses: statuses })

    expect(wrapper.findAll('.flex-wrap')).toHaveLength(0)

    const name = wrapper.findComponent(RouterLinkStub)
    expect(name.classes()).toContain('min-w-0')
    expect(name.classes()).toContain('truncate')

    for (const marker of wrapper.findAll('[title]')) {
      expect(marker.classes()).toContain('shrink-0')
    }
  })

  it('keeps the points pill on the line too, once finalized', () => {
    const wrapper = mountPanel({ isFinalized: true, mode: 'championship' })

    const pills = wrapper.findAll('.tabular-nums')
    expect(pills).toHaveLength(2)
    for (const pill of pills) {
      expect(pill.classes()).toContain('shrink-0')
    }
  })
})
