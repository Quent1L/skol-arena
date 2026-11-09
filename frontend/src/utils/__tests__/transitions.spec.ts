import { describe, it, expect, beforeEach, vi } from 'vitest'
import { nextTick, reactive } from 'vue'
import { usePageTransitions } from '../transitions'

const route = reactive<{ name: string | null | undefined }>({ name: undefined })
vi.mock('vue-router', () => ({ useRoute: () => route }))

async function goTo(...names: string[]) {
  for (const name of names) {
    route.name = name
    await nextTick()
  }
}

beforeEach(() => {
  route.name = undefined
})

describe('usePageTransitions', () => {
  it('fades on the first navigation, when there is no previous route', async () => {
    const { transitionName, isNavigatingBack } = usePageTransitions()

    await goTo('home')

    expect(transitionName.value).toBe('fade')
    expect(isNavigatingBack.value).toBe(false)
  })

  it('fades forward and slides right back for a route without a rule', async () => {
    route.name = 'home'
    const { transitionName, isNavigatingBack } = usePageTransitions()

    await goTo('tournaments')
    expect(transitionName.value).toBe('fade')
    expect(isNavigatingBack.value).toBe(false)

    await goTo('quiz-classic', 'tournaments')
    expect(transitionName.value).toBe('slide-right')
    expect(isNavigatingBack.value).toBe(true)
  })

  it('fades when going back to home from a deeper screen', async () => {
    route.name = 'profile'
    const { transitionName } = usePageTransitions()

    await goTo('home')

    expect(transitionName.value).toBe('fade')
  })

  it.each([
    ['rankings', 'slide-left'],
    ['stats', 'zoom'],
    ['profile', 'slide-up'],
  ])('uses the %s transition (%s) going forward from home', async (target, expected) => {
    route.name = 'home'
    const { transitionName } = usePageTransitions()

    await goTo(target)

    expect(transitionName.value).toBe(expected)
  })

  it('slides left into a quiz and down between quiz screens', async () => {
    route.name = 'home'
    const { transitionName } = usePageTransitions()

    await goTo('quiz')
    expect(transitionName.value).toBe('slide-left')

    await goTo('quiz-classic')
    expect(transitionName.value).toBe('slide-down')
  })

  it('treats a move between siblings as backward once it was visited earlier', async () => {
    route.name = 'rankings'
    const { isNavigatingBack } = usePageTransitions()

    await goTo('stats', 'rankings', 'stats')

    expect(isNavigatingBack.value).toBe(true)
  })

  it('keeps the previous transition when the route loses its name', async () => {
    route.name = 'home'
    const { transitionName } = usePageTransitions()
    await goTo('stats')

    route.name = null
    await nextTick()

    expect(transitionName.value).toBe('fade')
  })
})
