import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const KEY = 'skol.whatsNew.seenVersion'

/** Fresh module per test: the seen version is read from storage at import, like a page load. */
async function load() {
  vi.resetModules()
  return (await import('../useWhatsNew')).useWhatsNew
}

describe('useWhatsNew', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.spyOn(window, 'open').mockImplementation(() => null)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('shows the badge when no notes were ever opened', async () => {
    const useWhatsNew = await load()
    expect(useWhatsNew('2.1.0', '2.1.3').hasUnseen.value).toBe(true)
  })

  it('shows the badge when the last opened notes are older', async () => {
    localStorage.setItem(KEY, '2.0.4')
    const useWhatsNew = await load()
    expect(useWhatsNew('2.1.0', '2.1.0').hasUnseen.value).toBe(true)
  })

  it('hides the badge once the current notes were opened', async () => {
    localStorage.setItem(KEY, '2.1.0')
    const useWhatsNew = await load()
    expect(useWhatsNew('2.1.0', '2.1.3').hasUnseen.value).toBe(false)
  })

  it('stays quiet when the bundle ships no notes at all', async () => {
    const useWhatsNew = await load()
    const whatsNew = useWhatsNew('', '2.1.3')
    expect(whatsNew.hasUnseen.value).toBe(false)
    expect(whatsNew.url).toBe('https://skol-arena.com/changelog#v2.1.3')
  })

  it('links to the section of the notes, not of the app version', async () => {
    const useWhatsNew = await load()
    expect(useWhatsNew('2.1.0', '2.1.3').url).toBe('https://skol-arena.com/changelog#v2.1.0')
  })

  it('opens the changelog in a new tab and turns the badge off everywhere', async () => {
    const useWhatsNew = await load()
    const menuEntry = useWhatsNew('2.1.0', '2.1.0')
    const avatarBadge = useWhatsNew('2.1.0', '2.1.0')

    menuEntry.open()

    expect(window.open).toHaveBeenCalledWith(
      'https://skol-arena.com/changelog#v2.1.0',
      '_blank',
      'noopener',
    )
    expect(avatarBadge.hasUnseen.value).toBe(false)
    expect(localStorage.getItem(KEY)).toBe('2.1.0')
  })

  it('still works when storage is blocked', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    const useWhatsNew = await load()
    const whatsNew = useWhatsNew('2.1.0', '2.1.0')

    expect(whatsNew.hasUnseen.value).toBe(true)
    whatsNew.open()
    expect(whatsNew.hasUnseen.value).toBe(false)
  })
})
