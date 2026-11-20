import { ref, onMounted } from 'vue'

// Shared reactive viewport state (singleton)
const width = ref(typeof window !== 'undefined' ? window.innerWidth : 0)

function computeIsMobile(): boolean {
  if (typeof window === 'undefined') return false
  const isTouchPrimary =
    typeof window.matchMedia === 'function'
      ? window.matchMedia('(hover: none) and (pointer: coarse)').matches
      : false
  return (
    isTouchPrimary ||
    Math.min(window.screen.width, window.screen.height) < 768 ||
    window.innerWidth < 768
  )
}

const isMobile = ref(computeIsMobile())

function update() {
  if (typeof window === 'undefined') return
  width.value = window.innerWidth
  isMobile.value = computeIsMobile()
}

let initialized = false

function init() {
  if (initialized) return
  if (typeof window !== 'undefined') {
    update()
    window.addEventListener('resize', update)
    initialized = true
  }
}

export function useViewport() {
  onMounted(init)
  return { width, isMobile }
}
