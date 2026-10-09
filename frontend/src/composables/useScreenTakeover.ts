import { computed, onMounted, onUnmounted, ref, watch, type WatchSource } from 'vue'

/**
 * Full-screen moments currently on screen: an MMR recap, a badge reveal, a rewind…
 * Secondary messages (the update notice) wait for the screen to be free rather than
 * play underneath one, where nobody can see them.
 */
const holders = ref(0)

export const screenTakenOver = computed(() => holders.value > 0)

function hold(): () => void {
  holders.value += 1
  let released = false
  return () => {
    if (released) return
    released = true
    holders.value -= 1
  }
}

/** For a component that is on screen exactly while it is mounted. */
export function holdScreen(): void {
  let release: (() => void) | null = null
  onMounted(() => {
    release = hold()
  })
  onUnmounted(() => release?.())
}

/** For a component that stays mounted and shows itself through a flag. */
export function holdScreenWhile(active: WatchSource<boolean>): void {
  let release: (() => void) | null = null
  watch(
    active,
    (isActive) => {
      if (isActive && !release) release = hold()
      if (!isActive && release) {
        release()
        release = null
      }
    },
    { immediate: true },
  )
  onUnmounted(() => release?.())
}

/**
 * Resolves once no full-screen moment has been showing for `settleMs` in a row. The
 * settle time lets a page that is still loading open its recap before we commit.
 */
export function waitForFreeScreen(settleMs: number): Promise<void> {
  return new Promise((resolve) => {
    let timer: ReturnType<typeof setTimeout> | null = null
    const arm = () => {
      timer = setTimeout(() => {
        stop()
        resolve()
      }, settleMs)
    }
    const stop = watch(screenTakenOver, (busy) => {
      if (timer) clearTimeout(timer)
      timer = null
      if (!busy) arm()
    })
    if (!screenTakenOver.value) arm()
  })
}
