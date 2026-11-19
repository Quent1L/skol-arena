import { computed, provide, shallowReactive, watch } from 'vue'
import {
  routeLocationKey,
  routerViewLocationKey,
  useRoute,
  type RouteLocationNormalizedLoaded,
} from 'vue-router'

/**
 * For a route component kept alive by `<KeepAlive>`. Hidden behind another page, the
 * global route points there: its `params.id` is the other page's, its child gone. The
 * component's whole subtree — nested RouterView and every `useRoute()` below — keeps
 * reading the last route that showed this record with this `id` instead. Returns it,
 * for the component itself, which `provide` does not reach.
 */
export function useFrozenRoute(): RouteLocationNormalizedLoaded {
  const globalRoute = useRoute()
  const ownRecord = globalRoute.matched[0]
  const ownId = globalRoute.params.id
  const route = shallowReactive({ ...globalRoute })
  watch(
    () => globalRoute.fullPath,
    () => {
      if (globalRoute.matched[0] === ownRecord && globalRoute.params.id === ownId) {
        Object.assign(route, globalRoute)
      }
    },
  )
  provide(routeLocationKey, route)
  provide(routerViewLocationKey, computed(() => route))
  return route
}
