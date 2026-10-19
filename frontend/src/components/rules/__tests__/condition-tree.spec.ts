import { describe, it, expect } from 'vitest'
import type { RuleConditions } from '@skol-arena/shared/types/index'
import { convertStringDatesToJS } from '@/utils/DateUtils'
import { fromConditions, restoreDateValues, toConditions } from '../condition-tree'

const stored: RuleConditions = {
  all: [
    { fact: 'matchDate', operator: 'greaterThan', value: '2026-01-31' },
    { any: [{ fact: 'matchDate', operator: 'equal', value: '2026-12-31' }] },
    { fact: 'matchScore', operator: 'in', value: ['2-1', '2-0'] },
    { fact: 'scoreWinner', operator: 'equal', value: 2 },
    { fact: 'isWinner', operator: 'equal', value: false },
  ],
}

describe('restoreDateValues', () => {
  it('undoes what the HTTP interceptor did to date values, at any depth', () => {
    const revived = convertStringDatesToJS(structuredClone(stored))

    expect(restoreDateValues(revived)).toEqual(stored)
  })

  it('restores dates inside a list value', () => {
    const revived = convertStringDatesToJS({
      fact: 'matchDate',
      operator: 'in',
      value: ['2026-07-14', '2026-08-15'],
    })

    expect(restoreDateValues(revived)).toEqual({
      fact: 'matchDate',
      operator: 'in',
      value: ['2026-07-14', '2026-08-15'],
    })
  })
})

describe('toConditions / fromConditions', () => {
  it('round-trips a nested tree', () => {
    expect(toConditions(fromConditions(stored))).toEqual(stored)
  })
})
