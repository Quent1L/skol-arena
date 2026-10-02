import { describe, it, expect } from 'vitest'
import { getInitials, getAvatarBg, matchesSearch, normalizeForSearch } from '../StringUtils'

describe('getInitials', () => {
  it("'?' for null or empty", () => {
    expect(getInitials(null)).toBe('?')
    expect(getInitials(undefined)).toBe('?')
    expect(getInitials('')).toBe('?')
  })

  it('first letter of the first and last words', () => {
    expect(getInitials('John Doe')).toBe('JD')
    expect(getInitials('Jean Paul Marc')).toBe('JM')
  })

  it('first two letters for a single word', () => {
    expect(getInitials('alice')).toBe('AL')
  })

  it('ignores extra whitespace', () => {
    expect(getInitials('  padded name  ')).toBe('PN')
  })
})

describe('getAvatarBg', () => {
  it('deterministic for the same name', () => {
    expect(getAvatarBg('Alice')).toBe(getAvatarBg('Alice'))
  })

  it('returns a hex color', () => {
    expect(getAvatarBg('Bob')).toMatch(/^#[0-9a-f]{6}$/)
  })
})

describe('normalizeForSearch', () => {
  it('folds case and diacritics', () => {
    expect(normalizeForSearch('Éloïse Çédric')).toBe('eloise cedric')
  })
})

describe('matchesSearch', () => {
  it('ignores accents on either side', () => {
    expect(matchesSearch('Éloïse', 'eloise')).toBe(true)
    expect(matchesSearch('Eloise', 'ÉLOÏSE')).toBe(true)
  })

  it('matches a substring', () => {
    expect(matchesSearch('Jérôme Martin', 'rome')).toBe(true)
  })

  it('an empty query matches everything', () => {
    expect(matchesSearch('Alice', '  ')).toBe(true)
  })

  it('rejects a non-matching name and tolerates null', () => {
    expect(matchesSearch('Alice', 'bob')).toBe(false)
    expect(matchesSearch(null, 'bob')).toBe(false)
  })
})
