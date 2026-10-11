import { describe, it, expect } from 'vitest'
import { defineComponent, h } from 'vue'
import { mount } from '@vue/test-utils'
import { registerBottomNav, useBottomNavPresence } from '../useBottomNav'

const FakeNav = defineComponent({
  setup() {
    registerBottomNav()
    return () => h('nav')
  },
})

describe('useBottomNav', () => {
  it('reports a bottom nav only while one is mounted', () => {
    const hasBottomNav = useBottomNavPresence()
    expect(hasBottomNav.value).toBe(false)

    const nav = mount(FakeNav)
    expect(hasBottomNav.value).toBe(true)

    nav.unmount()
    expect(hasBottomNav.value).toBe(false)
  })

  it('stays present while an overlapping nav is still mounted', () => {
    const hasBottomNav = useBottomNavPresence()
    const outgoing = mount(FakeNav)
    const incoming = mount(FakeNav)

    outgoing.unmount()
    expect(hasBottomNav.value).toBe(true)

    incoming.unmount()
    expect(hasBottomNav.value).toBe(false)
  })
})
