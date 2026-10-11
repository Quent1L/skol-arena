// jsdom lacks several browser APIs that Nuxt UI overlays (menus, popovers)
// and viewport composables rely on.
import { vi } from 'vitest'

if (!window.matchMedia) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }))
}

class ObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords() {
    return []
  }
}

if (!window.ResizeObserver) {
  window.ResizeObserver = ObserverStub as unknown as typeof ResizeObserver
}

if (!window.IntersectionObserver) {
  window.IntersectionObserver = ObserverStub as unknown as typeof IntersectionObserver
}

if (!Element.prototype.scrollTo) {
  Element.prototype.scrollTo = () => {}
}
