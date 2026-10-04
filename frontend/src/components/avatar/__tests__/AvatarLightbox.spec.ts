import { describe, it, expect, vi, beforeEach } from 'vitest'
import { nextTick } from 'vue'
import { flushPromises } from '@vue/test-utils'
import { mountWithPrime } from '@/test-support/mount'
import { resetAvatarCache, useAvatarService } from '@/composables/avatar/avatar.service'
import AvatarLightbox from '../AvatarLightbox.vue'

vi.mock('vue-i18n', async () => (await import('@/test-support/mock-modules')).i18nEchoMock())

const ID = '00000000-0000-4000-8000-000000000001'
const VERSION = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'

async function mountLightbox(visible = true) {
  const wrapper = mountWithPrime(AvatarLightbox, {
    props: { playerId: ID, name: 'John Doe', visible },
    global: { stubs: { teleport: true } },
  })
  await flushPromises()
  return wrapper
}

describe('AvatarLightbox', () => {
  beforeEach(() => {
    resetAvatarCache()
    useAvatarService().remember(ID, VERSION)
  })

  it('offers every variant up to 1024 and sizes it to the viewport', async () => {
    const img = (await mountLightbox()).find('[data-testid="avatar-lightbox-image"]')

    expect(img.attributes('src')).toContain(`/api/avatars/${ID}/${VERSION}/1024.webp`)
    expect(img.attributes('srcset')).toContain('512.webp 512w')
    expect(img.attributes('srcset')).toContain('1024.webp 1024w')
    expect(img.attributes('sizes')).toBe('min(90vw, 90vh)')
    expect(img.attributes('alt')).toBe('John Doe')
  })

  it('renders nothing while hidden', async () => {
    expect((await mountLightbox(false)).find('[data-testid="avatar-lightbox-image"]').exists()).toBe(false)
  })

  it('closes from its button', async () => {
    const wrapper = await mountLightbox()
    await wrapper.find('button[aria-label="common.close"]').trigger('click')
    expect(wrapper.emitted('update:visible')?.[0]).toEqual([false])
  })

  it('closes on Escape and on a click outside the photo, not on the photo itself', async () => {
    const wrapper = await mountLightbox()
    await wrapper.find('[data-testid="avatar-lightbox-image"]').trigger('click')
    expect(wrapper.emitted('update:visible')).toBeUndefined()

    await wrapper.find('[data-testid="avatar-lightbox"]').trigger('click')
    expect(wrapper.emitted('update:visible')).toEqual([[false]])

    const other = await mountLightbox()
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    expect(other.emitted('update:visible')).toEqual([[false]])
  })

  it('locks the page scroll while open', async () => {
    await mountLightbox()
    expect(document.body.style.overflow).toBe('hidden')
  })

  it('shows a spinner only once the large image takes a while, never a thumbnail', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    try {
      const wrapper = await mountLightbox()
      const loading = () => wrapper.find('[data-testid="avatar-lightbox-loading"]').exists()

      expect(loading()).toBe(false)
      expect(wrapper.findAll('img')).toHaveLength(1)
      expect(wrapper.find('[data-testid="avatar-lightbox-image"]').classes()).toContain('opacity-0')

      vi.advanceTimersByTime(300)
      await nextTick()
      expect(loading()).toBe(true)

      await wrapper.find('[data-testid="avatar-lightbox-image"]').trigger('load')
      expect(loading()).toBe(false)
      expect(wrapper.find('[data-testid="avatar-lightbox-image"]').classes()).toContain('opacity-100')
    } finally {
      vi.useRealTimers()
    }
  })

  it('never shows the spinner for an image that loads quickly', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    try {
      const wrapper = await mountLightbox()
      await wrapper.find('[data-testid="avatar-lightbox-image"]').trigger('load')
      vi.advanceTimersByTime(1000)
      await nextTick()
      expect(wrapper.find('[data-testid="avatar-lightbox-loading"]').exists()).toBe(false)
    } finally {
      vi.useRealTimers()
    }
  })

  it('explains a failed load instead of showing a broken image, and can retry', async () => {
    const wrapper = await mountLightbox()
    await wrapper.find('[data-testid="avatar-lightbox-image"]').trigger('error')

    expect(wrapper.find('[data-testid="avatar-lightbox-error"]').text()).toContain(
      'avatarLightbox.loadFailed',
    )
    expect(wrapper.find('[data-testid="avatar-lightbox-image"]').exists()).toBe(false)

    await wrapper.find('[data-testid="avatar-lightbox-retry"]').trigger('click')

    expect(wrapper.find('[data-testid="avatar-lightbox-error"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="avatar-lightbox-image"]').exists()).toBe(true)
    expect(wrapper.findAll('img')).toHaveLength(1)
  })

  it('shows no image for a player without a photo', async () => {
    useAvatarService().remember(ID, null)
    expect((await mountLightbox()).find('[data-testid="avatar-lightbox-image"]').exists()).toBe(false)
  })
})
