import { computed, onMounted, onUnmounted, shallowRef } from 'vue'
import { useRoute, useRouter, type RouteLocationNormalizedLoaded, type RouteLocationRaw } from 'vue-router'

/**
 * Tournament screens opened from a card on the infos tab rather than from the bottom
 * nav: going back from them means returning to the infos tab, not leaving the tournament.
 */
export const TOURNAMENT_SUB_PAGES = ['participants', 'teams', 'badges']

/** Entry points: there is nothing above them to go back to. */
const ROOT_ROUTES = new Set([
  'tournaments',
  'home',
  'login',
  'signup',
  'register',
  'submit-invitation',
  'forgot-password',
  'reset-password',
  'offline',
  'not-found',
])

const TOURNAMENT_ROUTES = new Set(['tournament-detail', 'tournament-tab'])

/** Returns true when it handled the tap, false to let the default behaviour run. */
export type HeaderBackHandler = () => boolean

const override = shallowRef<HeaderBackHandler | null>(null)

/**
 * Where the header's back button leads when the browser history cannot be trusted:
 * a page opened from a link or a notification, or a tournament whose tabs pile up in
 * the history. Null hides the button. Admin keeps its own navigation.
 */
export function resolveBackTarget(route: RouteLocationNormalizedLoaded): RouteLocationRaw | null {
  const name = route.name as string | undefined
  if (!name || ROOT_ROUTES.has(name) || route.path.startsWith('/admin')) return null
  if (TOURNAMENT_ROUTES.has(name)) {
    const tab = route.params.tab as string | undefined
    if (tab && TOURNAMENT_SUB_PAGES.includes(tab)) {
      // Named explicitly: a bare /tournaments/:id lands on the mode's default tab
      // (standings) whenever the tournament view mounts afresh, e.g. back from the rules.
      return { name: 'tournament-tab', params: { id: route.params.id, tab: 'infos' } }
    }
    return '/'
  }
  if (name === 'create-match') return `/tournaments/${route.params.tournamentId}`
  return '/'
}

/**
 * The one back button of the mobile layout, in the header next to the logo.
 *
 * A tournament is navigated structurally: switching tabs pushes history entries, so
 * "back" from any of them means "up" (the list, or the infos tab for a sub-page). Every
 * other screen follows the history, and falls back to its parent when opened cold.
 */
export function useHeaderBack() {
  const route = useRoute()
  const router = useRouter()

  const target = computed(() => resolveBackTarget(route))
  const canGoBack = computed(() => target.value !== null)

  function goBack() {
    if (override.value?.()) return
    const destination = target.value
    if (!destination) return
    const previous = window.history.state?.back as string | null | undefined
    const structural = TOURNAMENT_ROUTES.has(route.name as string)
    if (previous && (!structural || previous === router.resolve(destination).fullPath)) {
      router.back()
    } else {
      void router.push(destination)
    }
  }

  return { canGoBack, goBack }
}

/**
 * Lets the current screen take over the header's back button while it is mounted —
 * a form stepping back through its own steps before leaving the page.
 */
export function useHeaderBackOverride(handler: HeaderBackHandler) {
  onMounted(() => {
    override.value = handler
  })
  onUnmounted(() => {
    if (override.value === handler) override.value = null
  })
}
