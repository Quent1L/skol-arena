import { describe, it, expect, vi } from 'vitest'
import { reactive, ref } from 'vue'
import { flushPromises } from '@vue/test-utils'
import { CalendarDate, Time } from '@internationalized/date'
import { MATCH_SUBMITTED_FACTS, OPERATORS_BY_TYPE } from '@skol-arena/shared/types/index'
import { mountWithUi } from '@/test-support/mount'
import { convertStringDatesToJS } from '@/utils/DateUtils'
import type { CatalogFact } from '@/composables/rules/rules.api'
import type { BuilderNode } from '../condition-tree'
import ConditionRow from '../ConditionRow.vue'

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (key: string) => key, locale: ref('fr') }),
  createI18n: () => ({ global: { t: (key: string) => key }, install: () => {} }),
}))

type Leaf = Extract<BuilderNode, { kind: 'leaf' }>

const facts: CatalogFact[] = MATCH_SUBMITTED_FACTS.map((f) => ({
  ...f,
  operators: OPERATORS_BY_TYPE[f.type],
}))
const players = [
  { id: 'p1', displayName: 'Alice' },
  { id: 'p2', displayName: 'Bob' },
]

function mountRow(leaf: Partial<Leaf>) {
  const node = reactive<Leaf>({ kind: 'leaf', fact: '', operator: '', value: '', ...leaf })
  const wrapper = mountWithUi(ConditionRow, {
    props: { modelValue: node, facts, players },
    global: {
      provide: {
        disciplines: ref([{ id: 'd1', name: 'Babyfoot' }]),
        organisations: ref([{ id: 'o1', name: 'Club' }]),
        outcomeTypes: ref([{ id: 'ot1', name: 'Forfait', discipline: { name: 'Babyfoot' } }]),
        outcomeReasons: ref([{ id: 'or1', name: 'Blessure', outcomeType: { name: 'Forfait' } }]),
      },
    },
  })
  return { node, wrapper }
}

/** The value widget is the last of the row's selects/inputs. */
const selects = (wrapper: ReturnType<typeof mountRow>['wrapper']) =>
  wrapper.findAllComponents({ name: 'SelectMenu' })

describe('ConditionRow — date', () => {
  it('shows a stored YYYY-MM-DD value in the date input', () => {
    const { wrapper } = mountRow({ fact: 'matchDate', operator: 'equal', value: '2026-10-19' })

    const input = wrapper.findComponent({ name: 'InputDate' })
    expect(input.props('modelValue')?.toString()).toBe('2026-10-19')
    wrapper.unmount()
  })

  it('still shows the date once the HTTP interceptor revived it as a Date', () => {
    const revived = convertStringDatesToJS({ value: '2026-10-19' }).value
    const { wrapper } = mountRow({ fact: 'matchDate', operator: 'equal', value: revived })

    const input = wrapper.findComponent({ name: 'InputDate' })
    expect(input.props('modelValue')?.toString()).toBe('2026-10-19')
    wrapper.unmount()
  })

  it('stores a picked day as a YYYY-MM-DD string', async () => {
    const { node, wrapper } = mountRow({ fact: 'matchDate', operator: 'equal', value: '' })

    wrapper
      .findComponent({ name: 'InputDate' })
      .vm.$emit('update:modelValue', new CalendarDate(2026, 10, 19))
    await flushPromises()

    expect(node.value).toBe('2026-10-19')
    wrapper.unmount()
  })
})

describe('ConditionRow — other value inputs', () => {
  it('resets operator and value when the variable changes, true for a boolean', async () => {
    const { node, wrapper } = mountRow({ fact: 'scoreWinner', operator: 'equal', value: 3 })

    selects(wrapper)[0]!.vm.$emit('update:modelValue', 'isWinner')
    await flushPromises()

    expect(node).toMatchObject({ fact: 'isWinner', operator: '', value: true })
    wrapper.unmount()
  })

  it('stores the time of day as minutes', async () => {
    const { node, wrapper } = mountRow({ fact: 'matchMinuteOfDay', operator: 'equal', value: 1290 })

    const input = wrapper.findComponent({ name: 'InputTime' })
    expect(input.props('modelValue')?.toString()).toBe('21:30:00')
    input.vm.$emit('update:modelValue', new Time(8, 15))
    await flushPromises()

    expect(node.value).toBe(495)
    wrapper.unmount()
  })

  it('stores a number, and an empty string once cleared', async () => {
    const { node, wrapper } = mountRow({ fact: 'scoreWinner', operator: 'equal', value: '' })

    const input = wrapper.findComponent({ name: 'InputNumber' })
    input.vm.$emit('update:modelValue', 3)
    await flushPromises()
    expect(node.value).toBe(3)

    input.vm.$emit('update:modelValue', null)
    await flushPromises()
    expect(node.value).toBe('')
    wrapper.unmount()
  })

  it('stores free text as is, and splits it under a list operator', async () => {
    const { node, wrapper } = mountRow({ fact: 'matchScore', operator: 'equal', value: '' })

    wrapper.findComponent({ name: 'Input' }).vm.$emit('update:modelValue', '2-1')
    await flushPromises()
    expect(node.value).toBe('2-1')

    selects(wrapper)[1]!.vm.$emit('update:modelValue', 'in')
    await flushPromises()
    wrapper.findComponent({ name: 'Input' }).vm.$emit('update:modelValue', '2-1, 2-0 ,')
    await flushPromises()
    expect(node.value).toEqual(['2-1', '2-0'])
    wrapper.unmount()
  })

  it('stores the boolean picked', async () => {
    const { node, wrapper } = mountRow({ fact: 'isWinner', operator: 'equal', value: true })

    selects(wrapper)[2]!.vm.$emit('update:modelValue', false)
    await flushPromises()

    expect(node.value).toBe(false)
    wrapper.unmount()
  })

  it.each([
    ['playerId', 'p1', ['p1', 'p2']],
    ['discipline', 'd1', ['d1']],
    ['site', 'o1', ['o1']],
    ['outcomeType', 'ot1', ['ot1']],
    ['outcomeReason', 'or1', ['or1']],
    ['matchDayOfWeek', 6, [6, 7]],
  ])('stores the %s picked, one or several', async (fact, single, several) => {
    const { node, wrapper } = mountRow({ fact, operator: 'equal', value: '' })

    selects(wrapper)[2]!.vm.$emit('update:modelValue', single)
    await flushPromises()
    expect(node.value).toBe(single)

    selects(wrapper)[1]!.vm.$emit('update:modelValue', 'in')
    await flushPromises()
    selects(wrapper)[2]!.vm.$emit('update:modelValue', several)
    await flushPromises()
    expect(node.value).toEqual(several)
    wrapper.unmount()
  })

  it('stores several players for a list fact', async () => {
    const { node, wrapper } = mountRow({ fact: 'winnerIds', operator: 'containsAny', value: [] })

    selects(wrapper)[2]!.vm.$emit('update:modelValue', ['p2'])
    await flushPromises()

    expect(node.value).toEqual(['p2'])
    wrapper.unmount()
  })

  it('drops a scalar value when switching to a list operator', async () => {
    const { node, wrapper } = mountRow({ fact: 'scoreWinner', operator: 'equal', value: 3 })

    selects(wrapper)[1]!.vm.$emit('update:modelValue', 'in')
    await flushPromises()

    expect(node.value).toEqual([])
    wrapper.unmount()
  })

  it('drops a list value when switching back to a scalar operator', async () => {
    const { node, wrapper } = mountRow({ fact: 'playerId', operator: 'in', value: ['p1', 'p2'] })

    selects(wrapper)[1]!.vm.$emit('update:modelValue', 'equal')
    await flushPromises()

    expect(node.value).toBe('')
    wrapper.unmount()
  })

  it('keeps the value when the operator stays in the same family', async () => {
    const { node, wrapper } = mountRow({ fact: 'scoreWinner', operator: 'equal', value: 3 })

    selects(wrapper)[1]!.vm.$emit('update:modelValue', 'greaterThan')
    await flushPromises()

    expect(node.value).toBe(3)
    wrapper.unmount()
  })
})
