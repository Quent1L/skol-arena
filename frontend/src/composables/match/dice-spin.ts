import { getCurrentInstance, onUnmounted, readonly, ref } from 'vue'

/**
 * The random button's dice, spun like a top. Every tap kicks it; taps stack, so
 * spamming the button winds it up, and it keeps turning after the last one.
 *
 * Friction is exponential, so the dice slows down smoothly rather than
 * stopping dead — and it is tuned on every kick so the dice comes to rest
 * exactly on a face (a multiple of 90°), never tilted, never snapping.
 */

/** Angular speed one tap adds, in degrees per second. */
export const SPIN_KICK = 420
/** Above this the eye no longer reads the rotation (and frames start to alias). */
export const SPIN_MAX_SPEED = 2880
/** Decay rate of the speed per second when nothing else is asked of it. */
export const SPIN_FRICTION = 1.4
/**
 * Once the dice has less than this left to travel, in degrees, it is placed on
 * its face. Small enough that the last step is invisible.
 */
const SPIN_REST_DISTANCE = 0.2

export interface SpinState {
  angle: number
  /** Degrees per second. */
  speed: number
  /** Exponential decay rate, per second. */
  friction: number
  /** Where the dice will come to rest. */
  target: number
}

export const restingSpin = (): SpinState => ({
  angle: 0,
  speed: 0,
  friction: SPIN_FRICTION,
  target: 0,
})

/**
 * Adds a tap's worth of speed, then picks the face to land on: the first one
 * past where plain friction would leave it. Friction is lowered to cover that
 * extra distance, so the landing needs no correction at the end.
 */
export function kickSpin(state: SpinState): SpinState {
  const speed = Math.min(state.speed + SPIN_KICK, SPIN_MAX_SPEED)
  const coast = speed / SPIN_FRICTION
  const target = Math.ceil((state.angle + coast) / 90) * 90
  return { angle: state.angle, speed, friction: speed / (target - state.angle), target }
}

/** Advances by `dt` seconds, integrating the decay exactly so frame rate does not matter. */
export function stepSpin(state: SpinState, dt: number): SpinState {
  const decay = Math.exp(-state.friction * dt)
  const speed = state.speed * decay
  if (speed / state.friction < SPIN_REST_DISTANCE)
    return { ...state, angle: state.target, speed: 0 }
  const angle = state.angle + (state.speed / state.friction) * (1 - decay)
  return { ...state, angle, speed }
}

function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  )
}

export function useDiceSpin() {
  const angle = ref(0)
  let state = restingSpin()
  let frame: number | null = null
  let last = 0

  function tick(now: number): void {
    // First frame after a kick: no elapsed time yet.
    const dt = last ? (now - last) / 1000 : 0
    last = now
    state = stepSpin(state, dt)
    angle.value = state.angle
    frame = state.speed > 0 ? requestAnimationFrame(tick) : null
  }

  function kick(): void {
    if (prefersReducedMotion()) return
    state = kickSpin(state)
    if (frame === null) {
      last = 0
      frame = requestAnimationFrame(tick)
    }
  }

  if (getCurrentInstance()) {
    onUnmounted(() => {
      if (frame !== null) cancelAnimationFrame(frame)
    })
  }

  return { angle: readonly(angle), kick }
}
