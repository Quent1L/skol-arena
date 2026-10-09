<template>
  <StatusPill :visible="visible">
    <i class="fa fa-check" />
    {{ t('updateNotice.done') }}
    <span
      v-if="carriesDot"
      ref="pillDot"
      class="notice-dot"
      :class="{ invisible: launched }"
      data-testid="update-notice-dot"
    />
  </StatusPill>
  <Teleport to="body">
    <span v-if="flying" ref="flyer" class="notice-dot flyer" aria-hidden="true" />
  </Teleport>
</template>

<script setup lang="ts">
import { nextTick, onMounted, ref, useTemplateRef } from 'vue'
import { useI18n } from 'vue-i18n'
import StatusPill from './ui/StatusPill.vue'
import { usePWAUpdate } from '@/composables/pwa/pwa.update'
import { useWhatsNewDotFlight } from '@/composables/whats-new/dot-flight'
import { screenTakenOver, waitForFreeScreen } from '@/composables/useScreenTakeover'

/**
 * Says, once, that a routine update just landed — the full-screen confirmation is kept
 * for mandatory ones. When the new version lit the "what's new" dot, the pill carries
 * it and then flies it onto the avatar: the dot that appears there is visibly the
 * consequence of the update, not a red mark out of nowhere.
 *
 * It never plays under a full-screen moment (an MMR recap, a badge reveal…): it waits
 * for the screen to be free, and starts over if one opens before the dot takes off.
 */
const SHOW_BEFORE_FLIGHT_MS = 1000
const FLIGHT_MS = 700
const LINGER_MS = 900
/**
 * How long the screen must stay free before the notice plays. Also gives the landing
 * page time to open its own recap, which then goes first.
 */
const SETTLE_MS = 800
/** How far below the straight line the dot's arc sags at its middle. */
const ARC_SAG_PX = 48
const ARC_STEPS = 8

const { t } = useI18n()
const { updateNotice, clearUpdateNotice } = usePWAUpdate()
const { inFlight } = useWhatsNewDotFlight()

const visible = ref(false)
const carriesDot = ref(false)
const launched = ref(false)
const flying = ref(false)
const pillDot = useTemplateRef<HTMLElement>('pillDot')
const flyer = useTemplateRef<HTMLElement>('flyer')

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function prefersReducedMotion(): boolean {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
}

/** The header's dot, when the new version lit one. */
function findAvatarDot(): HTMLElement | null {
  return document.querySelector<HTMLElement>('[data-whats-new-target]')
}

/** Whether `dot` can be seen right now: the header does not stick, it may be scrolled away. */
function onScreen(dot: HTMLElement): boolean {
  const rect = dot.getBoundingClientRect()
  return rect.width > 0 && rect.bottom > 0
}

/** Points of a quadratic curve from (0, 0) to (dx, dy), sagging in the middle. */
function arcKeyframes(dx: number, dy: number): Keyframe[] {
  const cx = dx / 2
  const cy = dy / 2 + ARC_SAG_PX
  return Array.from({ length: ARC_STEPS + 1 }, (_, i) => {
    const p = i / ARC_STEPS
    const x = 2 * (1 - p) * p * cx + p * p * dx
    const y = 2 * (1 - p) * p * cy + p * p * dy
    const scale = 1 + 0.5 * Math.sin(Math.PI * p)
    return { transform: `translate(${x}px, ${y}px) scale(${scale})` }
  })
}

/** Flies a copy of the pill's dot onto `target`. False when it could not take off. */
async function fly(target: HTMLElement): Promise<boolean> {
  const from = pillDot.value?.getBoundingClientRect()
  if (!from || prefersReducedMotion()) return false
  launched.value = true
  flying.value = true
  await nextTick()
  const el = flyer.value
  if (!el?.animate) return false
  const to = target.getBoundingClientRect()
  el.style.left = `${from.left}px`
  el.style.top = `${from.top}px`
  const keyframes = arcKeyframes(to.left - from.left, to.top - from.top)
  await el.animate(keyframes, { duration: FLIGHT_MS, easing: 'ease-in-out', fill: 'forwards' })
    .finished
  return true
}

function land(target: HTMLElement, flew: boolean): void {
  flying.value = false
  inFlight.value = false
  if (!flew || !target.animate) return
  target.animate(
    [{ transform: 'scale(1)' }, { transform: 'scale(1.9)' }, { transform: 'scale(1)' }],
    {
      duration: 350,
      easing: 'ease-out',
    },
  )
}

/**
 * Shows the pill and hands the dot over. False when a full-screen moment opened
 * before the dot took off: the pill is withdrawn and the attempt must start over.
 */
async function attempt(target: HTMLElement | null): Promise<boolean> {
  await waitForFreeScreen(SETTLE_MS)
  launched.value = false
  visible.value = true
  await delay(SHOW_BEFORE_FLIGHT_MS)
  if (screenTakenOver.value) {
    visible.value = false
    return false
  }
  if (target) {
    const flew = onScreen(target) && (await fly(target).catch(() => false))
    land(target, flew)
  }
  await delay(LINGER_MS)
  visible.value = false
  return true
}

async function play(): Promise<void> {
  const target = findAvatarDot()
  carriesDot.value = target !== null
  // Hidden on the avatar until the flying one lands, however long the wait.
  inFlight.value = carriesDot.value
  while (!(await attempt(target))) {
    // A full-screen moment interrupted it: wait it out, then try again.
  }
  clearUpdateNotice()
}

// Mounted with the app shell, after the boot: the header — and its dot — are there.
onMounted(async () => {
  if (!updateNotice.value) return
  await nextTick()
  await play()
})
</script>

<style scoped>
.notice-dot {
  width: 0.5rem;
  height: 0.5rem;
  border-radius: 9999px;
  background-color: var(--color-red-500);
}

.flyer {
  position: fixed;
  z-index: 901;
  pointer-events: none;
}
</style>
