import DOMPurify from 'dompurify'

/**
 * Cleans stored rich text right before it reaches `v-html`. The server sanitizes on
 * write, but content saved before that existed is still in the database: this is
 * what keeps it from running in the reader's session.
 */
export function sanitizeHtml(html: string | null | undefined): string {
  if (!html) return ''
  return DOMPurify.sanitize(html, {
    USE_PROFILES: { html: true },
    FORBID_TAGS: ['style', 'form', 'input', 'button', 'textarea', 'select', 'iframe'],
    FORBID_ATTR: ['srcset'],
  })
}
