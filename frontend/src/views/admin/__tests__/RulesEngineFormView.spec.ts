import { describe, it, expect, vi, beforeEach } from 'vitest'
import { computed } from 'vue'
import { flushPromises } from '@vue/test-utils'
import { CalendarDate, Time } from '@internationalized/date'
import {
  MATCH_SUBMITTED_FACTS,
  OPERATORS_BY_TYPE,
  type ClientRule,
  type Rule,
} from '@skol-arena/shared/types/index'
import { mountWithUi } from '@/test-support/mount'
import { convertStringDatesToJS } from '@/utils/DateUtils'
import { rulesApi } from '@/composables/rules/rules.api'
import FontAwesomeIconPicker from '@/components/forms/FontAwesomeIconPicker.vue'
import RulesEngineFormView from '../RulesEngineFormView.vue'

const routeParams: { id?: string } = {}
const push = vi.fn()
const toastAdd = vi.fn()

vi.mock('vue-i18n', async () => (await import('@/test-support/mock-modules')).i18nEchoMock())
vi.mock('vue-router', async (importOriginal) => ({
  ...(await importOriginal<typeof import('vue-router')>()),
  useRoute: () => ({ params: routeParams }),
  useRouter: () => ({ push }),
}))
vi.mock('@/composables/useAppToast', () => ({ useAppToast: () => ({ add: toastAdd }) }))
vi.mock('@/composables/useFormReferences', () => ({
  useFormReferences: () => ({
    disciplineOptions: computed(() => [{ label: 'Babyfoot', value: 'd1' }]),
    loadAll: vi.fn().mockResolvedValue(undefined),
  }),
}))
vi.mock('@/composables/rules/rules.api', () => ({
  rulesApi: {
    getById: vi.fn(),
    getCatalog: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    test: vi.fn(),
  },
}))
vi.mock('@/composables/user/user.api', () => ({
  userApi: { list: vi.fn().mockResolvedValue([{ id: 'p1', displayName: 'Alice' }]) },
}))
vi.mock('@/composables/outcome-type.api', () => ({
  outcomeTypeApi: { list: vi.fn().mockResolvedValue([]) },
}))
vi.mock('@/composables/outcome-reason.api', () => ({
  outcomeReasonApi: { list: vi.fn().mockResolvedValue([]) },
}))
vi.mock('@/composables/discipline/discipline.api', () => ({
  disciplineApi: { list: vi.fn().mockResolvedValue([]) },
}))
vi.mock('@/composables/organization/organization.api', () => ({
  organizationApi: { list: vi.fn().mockResolvedValue([]) },
}))

/** What the server stores and sends, before the HTTP interceptor touches it. */
function wireRule(overrides: Partial<Rule> = {}): Rule {
  return {
    id: 'r1',
    triggerEvent: 'match_submitted',
    type: 'message',
    scope: 'discipline',
    disciplineId: 'd1',
    priority: 5,
    name: 'Fête nationale',
    description: 'Le 14 juillet',
    conditions: {
      all: [
        { fact: 'matchDate', operator: 'equal', value: '2026-07-14' },
        { fact: 'matchMinuteOfDay', operator: 'greaterThan', value: 1200 },
        { any: [{ fact: 'playerId', operator: 'in', value: ['p1'] }] },
      ],
    },
    action: { type: 'message', variants: ['Bravo {{playerId}}'] },
    isActive: false,
    engineVersion: 3,
    disabledReason: null,
    createdBy: 'u1',
    createdAt: '2026-07-01T10:00:00.000Z',
    updatedAt: '2026-07-01T10:00:00.000Z',
    ...overrides,
  }
}

/** The API module receives payloads the real interceptor has already revived. */
const revived = <T>(data: T): T => convertStringDatesToJS(JSON.parse(JSON.stringify(data)))

const catalog = MATCH_SUBMITTED_FACTS.map((f) => ({ ...f, operators: OPERATORS_BY_TYPE[f.type] }))

async function mountForm(id?: string) {
  if (id) routeParams.id = id
  else delete routeParams.id
  const wrapper = mountWithUi(RulesEngineFormView, {
    global: { stubs: { FontAwesomeIconPicker: true } },
  })
  await flushPromises()
  return wrapper
}

type Wrapper = Awaited<ReturnType<typeof mountForm>>

function field(wrapper: Wrapper, label: string) {
  const found = wrapper
    .findAllComponents({ name: 'FormField' })
    .find((f) => f.props('label') === label)
  if (!found) throw new Error(`no field ${label}`)
  return found
}

function button(wrapper: Wrapper, label: string) {
  const found = wrapper
    .findAllComponents({ name: 'Button' })
    .find((b) => b.props('label') === label)
  if (!found) throw new Error(`no button ${label}`)
  return found
}

async function emit(target: { vm: { $emit: (e: string, v: unknown) => void } }, value: unknown) {
  target.vm.$emit('update:modelValue', value)
  await flushPromises()
}

async function save(wrapper: Wrapper) {
  await button(wrapper, 'rulesEngineFormView.saveButton').trigger('click')
  await flushPromises()
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(rulesApi.getCatalog).mockResolvedValue(revived({ facts: catalog }))
  vi.mocked(rulesApi.create).mockImplementation(
    async (data) => revived({ ...wireRule(), ...data }) as ClientRule,
  )
  vi.mocked(rulesApi.update).mockImplementation(
    async (_, data) => revived({ ...wireRule(), ...data }) as ClientRule,
  )
  vi.mocked(rulesApi.test).mockResolvedValue({ matched: true, output: null })
})

describe('RulesEngineFormView — editing an existing rule', () => {
  it('saves an untouched rule exactly as it was loaded, date included', async () => {
    vi.mocked(rulesApi.getById).mockResolvedValue(revived(wireRule()) as unknown as ClientRule)
    const wrapper = await mountForm('r1')

    await save(wrapper)

    const { conditions, ...rest } = wireRule()
    expect(rulesApi.update).toHaveBeenCalledWith('r1', {
      name: rest.name,
      description: rest.description,
      type: rest.type,
      triggerEvent: rest.triggerEvent,
      scope: rest.scope,
      disciplineId: rest.disciplineId,
      priority: rest.priority,
      isActive: rest.isActive,
      conditions,
      action: rest.action,
    })
    wrapper.unmount()
  })

  it('shows the stored date in the condition date input', async () => {
    vi.mocked(rulesApi.getById).mockResolvedValue(revived(wireRule()) as unknown as ClientRule)
    const wrapper = await mountForm('r1')

    const input = wrapper.findComponent({ name: 'InputDate' })
    expect(input.props('modelValue')?.toString()).toBe('2026-07-14')
    wrapper.unmount()
  })

  it('saves a date changed in the condition', async () => {
    vi.mocked(rulesApi.getById).mockResolvedValue(revived(wireRule()) as unknown as ClientRule)
    const wrapper = await mountForm('r1')

    await emit(wrapper.findComponent({ name: 'InputDate' }), new CalendarDate(2026, 12, 25))
    await save(wrapper)

    const payload = vi.mocked(rulesApi.update).mock.calls[0]![1]
    expect((payload.conditions as { all: unknown[] }).all[0]).toEqual({
      fact: 'matchDate',
      operator: 'equal',
      value: '2026-12-25',
    })
    wrapper.unmount()
  })

  it('round-trips a badge rule', async () => {
    const rule = wireRule({
      type: 'badge',
      scope: 'global',
      disciplineId: null,
      action: {
        type: 'badge',
        icon: 'fa fa-star',
        label: 'Star',
        description: 'Shines',
        recurrence: 'once',
      },
    })
    vi.mocked(rulesApi.getById).mockResolvedValue(revived(rule) as unknown as ClientRule)
    const wrapper = await mountForm('r1')

    await save(wrapper)

    expect(vi.mocked(rulesApi.update).mock.calls[0]![1]).toMatchObject({
      type: 'badge',
      scope: 'global',
      disciplineId: null,
      action: rule.action,
    })
    wrapper.unmount()
  })
})

describe('RulesEngineFormView — creating a rule', () => {
  async function fillMinimal(wrapper: Wrapper) {
    await emit(
      field(wrapper, 'rulesEngineFormView.labelName').findComponent({ name: 'Input' }),
      'R',
    )
    wrapper.findComponent({ name: 'ConditionBuilder' }).vm.$emit('update:modelValue', {
      all: [{ fact: 'scoreWinner', operator: 'equal', value: 2 }],
    })
    await flushPromises()
  }

  it('sends every metadata field as entered', async () => {
    const wrapper = await mountForm()
    await fillMinimal(wrapper)
    await emit(
      field(wrapper, 'rulesEngineFormView.labelDescription').findComponent({ name: 'Textarea' }),
      'Desc',
    )
    await emit(
      field(wrapper, 'rulesEngineFormView.labelScope').findComponent({ name: 'Tabs' }),
      'discipline',
    )
    await emit(field(wrapper, 'common.discipline').findComponent({ name: 'SelectMenu' }), 'd1')
    await emit(
      field(wrapper, 'rulesEngineFormView.labelPriority').findComponent({ name: 'InputNumber' }),
      7,
    )
    await emit(wrapper.findComponent({ name: 'Checkbox' }), false)
    await emit(wrapper.findAllComponents({ name: 'Textarea' }).at(-1)!, 'Hello')

    await save(wrapper)

    expect(rulesApi.create).toHaveBeenCalledWith({
      name: 'R',
      description: 'Desc',
      type: 'message',
      triggerEvent: 'match_submitted',
      scope: 'discipline',
      disciplineId: 'd1',
      priority: 7,
      isActive: false,
      conditions: { all: [{ fact: 'scoreWinner', operator: 'equal', value: 2 }] },
      action: { type: 'message', variants: ['Hello'] },
    })
    expect(push).toHaveBeenCalledWith('/admin/rules-engine')
    wrapper.unmount()
  })

  it('sends an empty description as null and drops blank message variants', async () => {
    const wrapper = await mountForm()
    await fillMinimal(wrapper)
    await button(wrapper, 'rulesEngineFormView.addVariant').trigger('click')
    await flushPromises()
    await emit(wrapper.findAllComponents({ name: 'Textarea' }).at(-2)!, 'Kept')

    await save(wrapper)

    expect(vi.mocked(rulesApi.create).mock.calls[0]![0]).toMatchObject({
      description: null,
      action: { type: 'message', variants: ['Kept'] },
    })
    wrapper.unmount()
  })

  it('falls back to priority 0 when the priority is cleared', async () => {
    const wrapper = await mountForm()
    await fillMinimal(wrapper)
    await emit(wrapper.findAllComponents({ name: 'Textarea' }).at(-1)!, 'Hello')
    await emit(
      field(wrapper, 'rulesEngineFormView.labelPriority').findComponent({ name: 'InputNumber' }),
      null,
    )

    await save(wrapper)

    expect(vi.mocked(rulesApi.create).mock.calls[0]![0].priority).toBe(0)
    wrapper.unmount()
  })

  it('sends the badge fields', async () => {
    const wrapper = await mountForm()
    await fillMinimal(wrapper)
    await emit(
      field(wrapper, 'rulesEngineFormView.labelType').findComponent({ name: 'Tabs' }),
      'badge',
    )
    await emit(wrapper.findComponent(FontAwesomeIconPicker), 'fa fa-star')
    await emit(
      field(wrapper, 'rulesEngineFormView.labelBadgeLabel').findComponent({ name: 'Input' }),
      'Star',
    )
    await emit(
      field(wrapper, 'rulesEngineFormView.labelBadgeDescription').findComponent({
        name: 'Textarea',
      }),
      'Shines',
    )
    await emit(
      field(wrapper, 'rulesEngineFormView.labelBadgeRecurrence').findComponent({ name: 'Tabs' }),
      'once',
    )

    await save(wrapper)

    expect(vi.mocked(rulesApi.create).mock.calls[0]![0]).toMatchObject({
      type: 'badge',
      action: {
        type: 'badge',
        icon: 'fa fa-star',
        label: 'Star',
        description: 'Shines',
        recurrence: 'once',
      },
    })
    wrapper.unmount()
  })

  it.each([
    ['validationNameRequired', async () => {}],
    [
      'validationConditionRequired',
      async (w: Wrapper) =>
        emit(field(w, 'rulesEngineFormView.labelName').findComponent({ name: 'Input' }), 'R'),
    ],
  ])('refuses to save and says why: %s', async (key, fill) => {
    const wrapper = await mountForm()
    await fill(wrapper)

    await save(wrapper)

    expect(rulesApi.create).not.toHaveBeenCalled()
    expect(toastAdd).toHaveBeenCalledWith(
      expect.objectContaining({ detail: `rulesEngineFormView.${key}` }),
    )
    wrapper.unmount()
  })

  it('requires a discipline, a message and the badge fields', async () => {
    const wrapper = await mountForm()
    await fillMinimal(wrapper)
    const detail = () => toastAdd.mock.calls.at(-1)![0].detail

    await save(wrapper)
    expect(detail()).toBe('rulesEngineFormView.validationMessageRequired')

    await emit(
      field(wrapper, 'rulesEngineFormView.labelScope').findComponent({ name: 'Tabs' }),
      'discipline',
    )
    await save(wrapper)
    expect(detail()).toBe('rulesEngineFormView.validationDisciplineRequired')

    await emit(
      field(wrapper, 'rulesEngineFormView.labelScope').findComponent({ name: 'Tabs' }),
      'global',
    )
    await emit(
      field(wrapper, 'rulesEngineFormView.labelType').findComponent({ name: 'Tabs' }),
      'badge',
    )
    await save(wrapper)
    expect(detail()).toBe('rulesEngineFormView.validationBadgeRequired')
    expect(rulesApi.create).not.toHaveBeenCalled()
    wrapper.unmount()
  })
})

describe('RulesEngineFormView — simulator', () => {
  async function openSimulator() {
    const wrapper = await mountForm()
    await button(wrapper, 'rulesEngineFormView.testButton').trigger('click')
    await flushPromises()
    const modal = wrapper.findComponent({ name: 'Modal' })
    const input = (label: string) =>
      modal.findAllComponents({ name: 'FormField' }).find((f) => f.props('label') === label)!
    const run = async () => {
      await button(wrapper, 'rulesEngineFormView.runTestButton').trigger('click')
      await flushPromises()
      return vi.mocked(rulesApi.test).mock.calls.at(-1)![0].context
    }
    return { wrapper, input, run }
  }
  const label = (key: string) => catalog.find((f) => f.key === key)!.label

  it('sends the fact samples in their stored form', async () => {
    const { wrapper, run } = await openSimulator()

    const context = await run()

    expect(context).toMatchObject({
      matchDate: '2026-06-12',
      matchMinuteOfDay: 1290,
      isWinner: true,
    })
    wrapper.unmount()
  })

  it('edits the match date with a date input', async () => {
    const { wrapper, input, run } = await openSimulator()

    const date = input(label('matchDate')).findComponent({ name: 'InputDate' })
    expect(date.props('modelValue')?.toString()).toBe('2026-06-12')
    await emit(date, new CalendarDate(2026, 7, 14))

    expect((await run()).matchDate).toBe('2026-07-14')
    wrapper.unmount()
  })

  it('edits time, number, boolean and player facts', async () => {
    const { wrapper, input, run } = await openSimulator()

    await emit(
      input(label('matchMinuteOfDay')).findComponent({ name: 'InputTime' }),
      new Time(9, 5),
    )
    await emit(input(label('scoreWinner')).findComponent({ name: 'InputNumber' }), 4)
    await emit(input(label('isWinner')).findComponent({ name: 'SelectMenu' }), false)
    await emit(input(label('playerId')).findComponent({ name: 'SelectMenu' }), 'p1')
    await emit(input(label('matchScore')).findComponent({ name: 'Input' }), '3-0')

    expect(await run()).toMatchObject({
      matchMinuteOfDay: 545,
      scoreWinner: 4,
      isWinner: false,
      playerId: 'p1',
      matchScore: '3-0',
    })
    wrapper.unmount()
  })
})
