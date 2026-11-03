import { afterEach, describe, expect, it, vi } from 'vitest'
import { MATCH_SUBMITTED_FACTS, OPERATORS_BY_TYPE } from '@skol-arena/shared'
import { i18n } from '@/i18n'
import fr from '@/i18n/messages/fr.json'
import en from '@/i18n/messages/en.json'
import { rulesApi } from '../rules.api'
import { useRulesService } from '../rules.service'

vi.mock('vue-i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('vue-i18n')>()),
  useI18n: () => i18n.global,
}))
vi.mock('../rules.api', () => ({ rulesApi: { getCatalog: vi.fn() } }))

const facts = MATCH_SUBMITTED_FACTS.map((f) => ({ ...f, operators: OPERATORS_BY_TYPE[f.type] }))

describe('rules catalog labels', () => {
  afterEach(() => {
    i18n.global.locale.value = 'fr'
  })

  it('has a label for every fact in both languages', () => {
    for (const fact of MATCH_SUBMITTED_FACTS) {
      expect(fr.rulesFacts).toHaveProperty(fact.key)
      expect(en.rulesFacts).toHaveProperty(fact.key)
    }
  })

  it('renders fact labels in the current language and follows a switch', async () => {
    vi.mocked(rulesApi.getCatalog).mockResolvedValue({ facts })
    const service = useRulesService()
    await service.loadCatalog('match_submitted')

    const teammates = () => service.catalog.value.find((f) => f.key === 'teammateIds')?.label
    expect(teammates()).toBe('Coéquipiers')

    i18n.global.locale.value = 'en'
    expect(teammates()).toBe('Teammates')
  })

  it("falls back to the server's label for a fact it does not know", async () => {
    const unknown = { ...facts[0]!, key: 'futureFact', label: 'Future fact' }
    vi.mocked(rulesApi.getCatalog).mockResolvedValue({ facts: [unknown] })
    const service = useRulesService()
    await service.loadCatalog('match_submitted')

    expect(service.catalog.value[0]?.label).toBe('Future fact')
  })
})
