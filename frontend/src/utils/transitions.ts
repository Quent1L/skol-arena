import { ref, watch } from 'vue'
import { useRoute } from 'vue-router'

// Route hierarchy used to determine direction
const routeHierarchy: Record<string, number> = {
  home: 0,
  quiz: 1,
  'quiz-classic': 2,
  'quiz-ranking': 2,
  rankings: 1,
  stats: 1,
  profile: 1,
}

interface TransitionRule {
  match: (newRoute: string, oldRoute: string) => boolean
  forward: string
  back: string
}

// Transition rules evaluated in order, first match wins
const transitionRules: TransitionRule[] = [
  {
    match: (n, o) => n.includes('quiz') && !o.includes('quiz'),
    forward: 'slide-left',
    back: 'slide-right',
  },
  {
    match: (n, o) => n.includes('quiz') && o.includes('quiz'),
    forward: 'slide-down',
    back: 'slide-right',
  },
  { match: (n) => n === 'profile', forward: 'slide-up', back: 'slide-up' },
  { match: (n) => n === 'stats', forward: 'zoom', back: 'zoom' },
  { match: (n) => n === 'rankings', forward: 'slide-left', back: 'slide-right' },
  { match: (n) => n === 'home', forward: 'zoom-out', back: 'fade' },
]

function getTransitionForRoute(newRoute: string, oldRoute: string, isBack: boolean): string {
  const rule = transitionRules.find((r) => r.match(newRoute, oldRoute))
  if (!rule) return isBack ? 'slide-right' : 'fade'
  return isBack ? rule.back : rule.forward
}

export function usePageTransitions() {
  const route = useRoute()

  const transitionName = ref('fade')
  const isNavigatingBack = ref(false)

  // Navigation history used to detect backward navigation
  const navigationHistory = ref<string[]>([])

  watch(
    () => route.name,
    (newRouteName, oldRouteName) => {
      if (!newRouteName || !oldRouteName) {
        transitionName.value = 'fade'
        return
      }

      const newRouteString = newRouteName.toString()
      const oldRouteString = oldRouteName.toString()

      // Add to history
      if (!navigationHistory.value.includes(newRouteString)) {
        navigationHistory.value.push(newRouteString)
      }

      // Determine whether this is backward navigation
      const newLevel = routeHierarchy[newRouteString] ?? 1
      const oldLevel = routeHierarchy[oldRouteString] ?? 1

      isNavigatingBack.value =
        newLevel < oldLevel ||
        (newLevel === oldLevel &&
          navigationHistory.value.indexOf(newRouteString) <
            navigationHistory.value.indexOf(oldRouteString))

      // Choose the appropriate transition
      transitionName.value = getTransitionForRoute(
        newRouteString,
        oldRouteString,
        isNavigatingBack.value,
      )
    },
    { immediate: true },
  )

  return {
    transitionName,
    isNavigatingBack,
  }
}
