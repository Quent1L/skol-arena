import { describe, it, expect, vi } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import type { ImpactedCompetition } from '@skol-arena/shared/types/index'
import { mountWithUi } from '@/test-support/mount'
import PropagateRulesetDialog from '../PropagateRulesetDialog.vue'

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (key: string) => key }),
  createI18n: () => ({ global: { t: (key: string) => key }, install: () => {} }),
}))

const drifting: ImpactedCompetition = {
  id: 't-drift',
  name: 'Championnat en cours',
  mode: 'championship',
  status: 'ongoing',
  matchCount: 4,
  hasDrift: true,
}

const upToDate: ImpactedCompetition = {
  id: 't-ok',
  name: 'Saison alignée',
  mode: 'ranked',
  status: 'ongoing',
  matchCount: 0,
  hasDrift: false,
}

// The modal teleports to body: query the document, not the wrapper.
const rows = () => [...document.body.querySelectorAll('[data-testid="propagate-row"]')]
const checkbox = (row: Element) => row.querySelector<HTMLButtonElement>('[role="checkbox"]')!
const isChecked = (row: Element) => checkbox(row).getAttribute('aria-checked') === 'true'

async function mountDialog(competitions: ImpactedCompetition[]) {
  const wrapper = mountWithUi(PropagateRulesetDialog, {
    props: { visible: true, disciplineId: 'd-1' },
  })
  await flushPromises()
  const dialog = wrapper.findComponent(PropagateRulesetDialog)
  dialog.vm.setCompetitions(competitions)
  await flushPromises()
  return { wrapper, dialog }
}

describe('PropagateRulesetDialog', () => {
  it('lists every competition with a checkbox so they can be picked', async () => {
    const { wrapper } = await mountDialog([drifting, upToDate])

    expect(rows()).toHaveLength(2)
    expect(rows().every((row) => checkbox(row))).toBe(true)
    wrapper.unmount()
  })

  it('preselects what has drifted and leaves the rest alone', async () => {
    const { wrapper } = await mountDialog([drifting, upToDate])

    expect(rows().map(isChecked)).toEqual([true, false])
    wrapper.unmount()
  })

  it('emits only the selected competitions', async () => {
    const { wrapper, dialog } = await mountDialog([drifting, upToDate])

    checkbox(rows()[1]!).click()
    await flushPromises()
    document.body.querySelector<HTMLButtonElement>('[data-testid="propagate-apply"]')!.click()
    await flushPromises()

    expect(dialog.emitted('propagate')?.[0]).toEqual([['t-drift', 't-ok']])
    wrapper.unmount()
  })

  it('asks its parent to load when it becomes visible', async () => {
    const wrapper = mountWithUi(PropagateRulesetDialog, {
      props: { visible: false, disciplineId: 'd-1' },
    })
    await flushPromises()

    await wrapper.setProps({ visible: true })
    await flushPromises()

    expect(wrapper.findComponent(PropagateRulesetDialog).emitted('load')?.[0]).toEqual(['d-1'])
    wrapper.unmount()
  })
})
