import { describe, it, expect, vi } from 'vitest'
import { defineComponent, h } from 'vue'
import { flushPromises } from '@vue/test-utils'
import { mountWithUi } from '@/test-support/mount'
import { useConfirmDialog } from '@/composables/useConfirmDialog'

vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (key: string) => key }) }))

function setup() {
  let confirm!: ReturnType<typeof useConfirmDialog>
  const Probe = defineComponent({
    setup() {
      confirm = useConfirmDialog()
      return () => h('div')
    },
  })
  const wrapper = mountWithUi(Probe)
  return { wrapper, ask: () => confirm({ title: 'Delete?', message: 'Gone for good' }) }
}

function button(label: string) {
  const found = [...document.body.querySelectorAll('button')].find((b) => b.textContent?.trim() === label)
  if (!found) throw new Error(`no button "${label}"`)
  return found
}

describe('useConfirmDialog', () => {
  it('resolves true when the user confirms', async () => {
    const { wrapper, ask } = setup()
    const answer = ask()
    await flushPromises()

    expect(document.body.textContent).toContain('Gone for good')
    button('common.confirm').click()

    expect(await answer).toBe(true)
    wrapper.unmount()
  })

  it('resolves false when the user cancels', async () => {
    const { wrapper, ask } = setup()
    const answer = ask()
    await flushPromises()

    button('common.cancel').click()

    expect(await answer).toBe(false)
    wrapper.unmount()
  })
})
