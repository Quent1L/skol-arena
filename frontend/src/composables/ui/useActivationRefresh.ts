import { onActivated, onDeactivated, type Ref } from 'vue'
import { writeSequence } from '@/config/ApiConfig'

/**
 * Past this, data hidden behind another page is refreshed even when nothing says it
 * moved: only some changes reach the socket (finalizations, standings), the rest
 * (a match reported, a player joining) never would.
 */
export const STALE_AFTER_MS = 60_000

/**
 * For a view kept alive by `<KeepAlive>`: runs `refresh` when it comes back on screen,
 * only when what it shows may be wrong — this client sent a write from another page,
 * socket events may have been missed, or it was away long enough for unbroadcast
 * changes to pile up. Otherwise the cached data is as fresh as when it was left.
 */
export function useActivationRefresh(refresh: () => void, eventsMissed: Ref<boolean>) {
  // Null until the first deactivation: the activation that follows the mount is not a return.
  let leftAt: number | null = null
  let writesAtLeave = 0

  onDeactivated(() => {
    leftAt = Date.now()
    writesAtLeave = writeSequence()
  })

  onActivated(() => {
    if (leftAt === null) return
    const stale =
      eventsMissed.value ||
      writeSequence() !== writesAtLeave ||
      Date.now() - leftAt > STALE_AFTER_MS
    leftAt = null
    if (!stale) return
    eventsMissed.value = false
    refresh()
  })
}
