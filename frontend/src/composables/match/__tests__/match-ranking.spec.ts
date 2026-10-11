import { describe, it, expect } from 'vitest'

import {
  firstPlaceCount,
  isCompleteRanking,
  orderFromRanks,
  ranksFromOrder,
  ranksFromScoreMap,
  tiesFromRanks,
} from '../match-ranking'

describe('match ranking helpers', () => {
  it('ranks a finishing order, a tied side sharing the rank above it', () => {
    expect(ranksFromOrder([3, 1, 2, 4], { 2: true })).toEqual({ 3: 1, 1: 2, 2: 2, 4: 4 })
  })

  it('ignores a tie flag on the first side', () => {
    expect(ranksFromOrder([2, 1], { 2: true })).toEqual({ 2: 1, 1: 2 })
  })

  it('reads the order and the ties back from ranks', () => {
    const ranks = { 1: 2, 2: 1, 3: 2 }
    const order = orderFromRanks([1, 2, 3], ranks)

    expect(order).toEqual([2, 1, 3])
    expect(tiesFromRanks(order, ranks)).toEqual({ 2: false, 1: false, 3: true })
  })

  it('ranks by score, highest first', () => {
    expect(ranksFromScoreMap([1, 2, 3], { 1: 4, 2: 9, 3: 4 })).toEqual({ 1: 2, 2: 1, 3: 2 })
  })

  it('accepts complete competition rankings only', () => {
    expect(isCompleteRanking([1, 2, 3], { 1: 1, 2: 1, 3: 3 })).toBe(true)
    expect(isCompleteRanking([1, 2, 3], { 1: 1, 2: 2 })).toBe(false)
    expect(isCompleteRanking([1, 2, 3], { 1: 1, 2: 1, 3: 2 })).toBe(false)
  })

  it('counts the sides sharing first place', () => {
    expect(firstPlaceCount({ 1: 1, 2: 1, 3: 3 })).toBe(2)
  })
})
