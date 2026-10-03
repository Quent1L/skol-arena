import { describe, it, expect } from 'vitest'
import { formatBytes } from '../bytes'

describe('formatBytes', () => {
  it('keeps small sizes in bytes', () => {
    expect(formatBytes(512, 'en')).toBe('512 byte')
  })

  it('steps up by 1024 with one decimal', () => {
    expect(formatBytes(1536, 'en')).toBe('1.5 kB')
    expect(formatBytes(5 * 1024 * 1024, 'en')).toBe('5 MB')
  })

  it('never goes negative', () => {
    expect(formatBytes(-1, 'en')).toBe('0 byte')
  })
})
