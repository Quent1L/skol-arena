import { describe, it, expect, vi, beforeEach } from 'vitest'
import { defineComponent, h } from 'vue'
import { flushPromises } from '@vue/test-utils'
import { mountWithPrime } from '@/test-support/mount'
import AvatarEditor from '../AvatarEditor.vue'

vi.mock('vue-i18n', async () => (await import('@/test-support/mock-modules')).i18nEchoMock())

const upload = vi.fn()
const remove = vi.fn()
let currentVersion: string | null = null
vi.mock('@/composables/avatar/avatar.service', () => ({
  useAvatarService: () => ({
    versionFor: () => currentVersion,
    avatarUrl: () => 'http://api.test/x.webp',
    upload,
    remove,
  }),
}))

const CropStub = defineComponent({
  name: 'AvatarCropDialog',
  props: { visible: Boolean, file: { type: Object, default: null } },
  emits: ['cropped', 'unreadable', 'update:visible'],
  setup: () => () => h('div'),
})

const USER = '00000000-0000-4000-8000-000000000001'

function mountEditor() {
  return mountWithPrime(AvatarEditor, {
    props: { userId: USER, name: 'John Doe' },
    global: { stubs: { AvatarCropDialog: CropStub } },
  })
}

async function choose(wrapper: ReturnType<typeof mountEditor>, file: File) {
  const input = wrapper.find('[data-testid="avatar-file-input"]')
  Object.defineProperty(input.element, 'files', { value: [file], configurable: true })
  await input.trigger('change')
}

describe('AvatarEditor', () => {
  beforeEach(() => {
    currentVersion = null
    upload.mockReset()
    remove.mockReset()
  })

  it('refuses a file whose type is not an accepted image before cropping', async () => {
    const wrapper = mountEditor()
    await choose(wrapper, new File(['<svg/>'], 'evil.png', { type: 'image/svg+xml' }))

    expect(wrapper.text()).toContain('avatarEditor.unsupported')
    expect(wrapper.findComponent(CropStub).props('visible')).toBe(false)
  })

  it('opens the cropper for an image, then uploads what it crops', async () => {
    upload.mockResolvedValue('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')
    const wrapper = mountEditor()
    const file = new File(['x'], 'me.jpg', { type: 'image/jpeg' })
    await choose(wrapper, file)

    const crop = wrapper.findComponent(CropStub)
    expect(crop.props('visible')).toBe(true)
    expect(crop.props('file')).toBe(file)

    const blob = new Blob(['cropped'], { type: 'image/webp' })
    crop.vm.$emit('cropped', blob)
    await flushPromises()

    expect(upload).toHaveBeenCalledWith(USER, blob)
    expect(wrapper.findComponent(CropStub).props('visible')).toBe(false)
  })

  it('shows the server message when the upload is refused', async () => {
    upload.mockRejectedValue(new Error('Unsupported image'))
    const wrapper = mountEditor()
    await choose(wrapper, new File(['x'], 'me.png', { type: 'image/png' }))

    wrapper.findComponent(CropStub).vm.$emit('cropped', new Blob(['x']))
    await flushPromises()

    expect(wrapper.text()).toContain('Unsupported image')
  })

  it('only offers removal when there is a picture', () => {
    expect(mountEditor().text()).not.toContain('avatarEditor.remove')
    currentVersion = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
    expect(mountEditor().text()).toContain('avatarEditor.remove')
  })
})
