import { describe, it, expect, vi } from 'vitest'
import { mountWithUi } from '@/test-support/mount'
import WhenStep from '../WhenStep.vue'

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (key: string) => key }),
}))

function mountStep(props: Record<string, unknown> = {}) {
  return mountWithUi(WhenStep, { props })
}

const emitted = (wrapper: ReturnType<typeof mountStep>, event: string) =>
  wrapper.findComponent(WhenStep).emitted(event)

function nextButton(wrapper: ReturnType<typeof mountStep>) {
  return wrapper.findAll('button').find((b) => b.text().includes('whenStep.next'))
}

function quickCard(wrapper: ReturnType<typeof mountStep>, label: string) {
  return wrapper.findAll('button.grid *, .grid button').length
    ? wrapper.findAll('.grid button').find((b) => b.text().includes(label))!
    : wrapper.findAll('button').find((b) => b.text().includes(label))!
}

describe('WhenStep', () => {
  it('renders the 4 date shortcuts', () => {
    const wrapper = mountStep()
    const labels = wrapper.findAll('.grid button').map((b) => b.text())
    expect(labels).toEqual([
      'whenStep.now',
      'whenStep.minus5',
      'whenStep.minus10',
      'whenStep.custom',
    ])
  })

  it('choosing "now" sets playedAt to now', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-07-06T14:00:00'))
    const wrapper = mountStep()
    await quickCard(wrapper, 'whenStep.now').trigger('click')
    const events = emitted(wrapper, 'update:playedAt')
    expect(events).toHaveLength(1)
    expect((events![0][0] as Date).getTime()).toBe(new Date('2026-07-06T14:00:00').getTime())
    vi.useRealTimers()
  })

  it('choosing "-5 min" moves playedAt back 5 minutes', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-07-06T14:00:00'))
    const wrapper = mountStep()
    await quickCard(wrapper, 'whenStep.minus5').trigger('click')
    const date = emitted(wrapper, 'update:playedAt')![0][0] as Date
    expect(date.getTime()).toBe(new Date('2026-07-06T13:55:00').getTime())
    vi.useRealTimers()
  })

  it('choosing "custom" shows the date input', async () => {
    const wrapper = mountStep()
    expect(wrapper.findComponent({ name: 'InputDate' }).exists()).toBe(false)
    await quickCard(wrapper, 'whenStep.custom').trigger('click')
    expect(wrapper.findComponent({ name: 'InputDate' }).exists()).toBe(true)
  })

  it('next button disabled with no date, emits next with a date', async () => {
    const wrapper = mountStep()
    expect(nextButton(wrapper)!.attributes('disabled')).toBeDefined()

    await wrapper.setProps({ playedAt: new Date() })
    const next = nextButton(wrapper)!
    expect(next.attributes('disabled')).toBeUndefined()
    await next.trigger('click')
    expect(emitted(wrapper, 'next')).toHaveLength(1)
  })

  it('hideNavigation hides the next button', () => {
    const wrapper = mountStep({ hideNavigation: true })
    expect(nextButton(wrapper)).toBeUndefined()
  })
})
