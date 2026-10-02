import { describe, it, expect } from 'vitest'
import { sanitizeHtml } from '../sanitize-html'

describe('sanitizeHtml', () => {
  it('drops scripts, handlers and javascript: links', () => {
    expect(sanitizeHtml('<p>a<script>alert(1)</script></p>')).toBe('<p>a</p>')
    expect(sanitizeHtml('<img src="x" onerror="alert(1)">')).toBe('<img src="x">')
    expect(sanitizeHtml('<a href="javascript:alert(1)">x</a>')).toBe('<a>x</a>')
  })

  it('keeps editor formatting', () => {
    const html = '<p style="text-align: center"><strong>b</strong> <em>i</em></p>'
    expect(sanitizeHtml(html)).toBe(html)
  })

  it('returns an empty string for missing content', () => {
    expect(sanitizeHtml(null)).toBe('')
    expect(sanitizeHtml(undefined)).toBe('')
  })
})
