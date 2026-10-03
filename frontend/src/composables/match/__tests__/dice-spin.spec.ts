import { describe, it, expect } from 'vitest'
import {
  SPIN_KICK,
  SPIN_MAX_SPEED,
  kickSpin,
  restingSpin,
  stepSpin,
  type SpinState,
} from '../dice-spin'

/** Runs the spin at 60 fps until it rests; returns the frames it went through. */
function run(state: SpinState, maxSeconds = 30): SpinState[] {
  const frames: SpinState[] = []
  for (let t = 0; t < maxSeconds && state.speed > 0; t += 1 / 60) {
    state = stepSpin(state, 1 / 60)
    frames.push(state)
  }
  return frames
}

describe('dice spin', () => {
  it('one tap turns the dice and lands it on a face', () => {
    const frames = run(kickSpin(restingSpin()))
    const rest = frames[frames.length - 1]

    expect(rest.speed).toBe(0)
    expect(rest.angle % 90).toBe(0)
    expect(rest.angle).toBeGreaterThan(0)
  })

  it('slows down smoothly: speed only decreases and the angle never goes back', () => {
    const frames = run(kickSpin(kickSpin(kickSpin(restingSpin()))))

    for (let i = 1; i < frames.length; i += 1) {
      expect(frames[i].speed).toBeLessThanOrEqual(frames[i - 1].speed)
      expect(frames[i].angle).toBeGreaterThanOrEqual(frames[i - 1].angle)
    }
  })

  it('stops gently rather than dead: the last moving step is tiny', () => {
    const frames = run(kickSpin(restingSpin()))
    const lastMove = frames[frames.length - 1].angle - frames[frames.length - 2].angle

    expect(lastMove).toBeLessThan(0.5)
  })

  it('taps stack up to a ceiling', () => {
    let state = restingSpin()
    state = kickSpin(state)
    expect(state.speed).toBe(SPIN_KICK)

    for (let i = 0; i < 50; i += 1) state = kickSpin(state)
    expect(state.speed).toBe(SPIN_MAX_SPEED)
  })

  it('a kick mid-spin keeps turning forward and still lands on a face', () => {
    let state = kickSpin(restingSpin())
    for (let i = 0; i < 20; i += 1) state = stepSpin(state, 1 / 60)
    const before = state.angle

    const frames = run(kickSpin(state))
    const rest = frames[frames.length - 1]

    expect(rest.angle).toBeGreaterThan(before)
    expect(rest.angle % 90).toBe(0)
  })

  it('does not depend on frame rate', () => {
    const at60 = run(kickSpin(restingSpin()))
    let state = kickSpin(restingSpin())
    while (state.speed > 0) state = stepSpin(state, 1 / 30)

    expect(state.angle).toBe(at60[at60.length - 1].angle)
  })
})
