import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import { announcementApi } from '@/composables/announcement/announcement.api'
import { useAnnouncementPopups } from '@/composables/announcement/announcement.service'
import { mountWithUi } from '@/test-support/mount'
import AnnouncementPopup from '../AnnouncementPopup.vue'

const i18n = createI18n({
  legacy: false,
  locale: 'en',
  messages: {
    en: { announcementPopup: { kicker: 'Announcement', gotIt: 'Got it', next: 'Next ({count} more)' } },
  },
})

const popup = (id: string, title: string) => ({
  id,
  title,
  body: `Body of ${title}`,
  audience: 'all' as const,
  tournamentId: null,
  createdAt: new Date('2026-11-01T10:00:00Z'),
})

function bodyText() {
  return document.body.textContent ?? ''
}

function dismissButton() {
  return document.body.querySelector<HTMLButtonElement>('[data-testid="announcement-dismiss"]')
}

describe('AnnouncementPopup', () => {
  const popups = useAnnouncementPopups()

  beforeEach(() => {
    popups.clear()
    vi.spyOn(announcementApi, 'markSeen').mockResolvedValue()
  })

  let wrapper: ReturnType<typeof mountWithUi> | null = null

  afterEach(() => {
    wrapper?.unmount()
    wrapper = null
    vi.restoreAllMocks()
  })

  it('shows the pending announcements one at a time and marks each seen', async () => {
    vi.spyOn(announcementApi, 'pending').mockResolvedValue([
      popup('a-1', 'Three new badges'),
      popup('a-2', 'Rule change'),
    ])
    await popups.loadPending()
    wrapper = mountWithUi(AnnouncementPopup, { props: { settleMs: 0 }, global: { plugins: [i18n] } })
    await vi.waitFor(() => expect(bodyText()).toContain('Three new badges'))

    expect(bodyText()).toContain('Body of Three new badges')
    expect(dismissButton()?.textContent).toContain('Next (1 more)')

    dismissButton()!.click()
    await flushPromises()

    expect(announcementApi.markSeen).toHaveBeenCalledWith('a-1')
    await vi.waitFor(() => expect(bodyText()).toContain('Rule change'))
    expect(dismissButton()?.textContent).toContain('Got it')
  })

  it('does not queue the same announcement twice', async () => {
    vi.spyOn(announcementApi, 'pending').mockResolvedValue([popup('a-1', 'Once')])

    await popups.loadPending()
    await popups.loadPending()

    expect(popups.remaining.value).toBe(0)
    expect(popups.current.value?.id).toBe('a-1')
  })

  it('stays silent when the pending list cannot be loaded', async () => {
    vi.spyOn(announcementApi, 'pending').mockRejectedValue(new Error('offline'))

    await expect(popups.loadPending('t-1')).resolves.toBeUndefined()
    expect(popups.current.value).toBeNull()
  })
})
