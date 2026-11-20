<template>
  <Transition name="update-fade">
    <div v-if="visible" class="update-overlay">
      <BrandBackdrop />
      <div class="update-content">
        <!-- The mark is the progress indicator: it fills as the bundle lands.
             This screen can hold someone for two minutes with no way out, so the
             waiting itself has to be worth looking at. -->
        <LogoFillGauge :progress="gaugeProgress" :complete="isDone" />
        <div class="update-text">
          <p class="update-title">{{ title }}</p>
          <p class="update-subtitle">{{ subtitle }}</p>
        </div>
        <p v-if="isDone" class="update-version">{{ version }}</p>
        <div v-else class="update-progress-track">
          <div
            v-if="percent !== null"
            class="update-progress-bar update-progress-measured"
            :style="{ width: `${percent}%` }"
          />
          <div
            v-else-if="isDownloading"
            class="update-progress-bar update-progress-indeterminate"
          />
          <div v-else class="update-progress-bar update-progress-timed" />
        </div>
        <p v-if="percent !== null" class="update-percent">{{ percent }}%</p>
        <p v-if="fileCount" class="update-files">
          {{ t('updateOverlay.fileProgress', fileCount) }}
        </p>
        <p v-if="showSlowHint" class="update-hint">
          {{ forced ? t('updateOverlay.forcedSlowHint') : t('updateOverlay.slowHint') }}
        </p>
        <button v-if="showDismiss" type="button" class="update-dismiss" @click="emit('dismiss')">
          {{ t('updateOverlay.continueAnyway') }}
        </button>
      </div>
    </div>
  </Transition>
</template>

<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import BrandBackdrop from '@/components/brand/BrandBackdrop.vue'
import LogoFillGauge from '@/components/brand/LogoFillGauge.vue'
import { useCountUp } from '@/composables/ui/useCountUp'
import { UPDATE_OVERLAY_MIN_MS, type UpdatePhase } from '@/composables/pwa/pwa.update'

/** Past this, say out loud that a slow connection is the likely explanation. */
const SLOW_HINT_MS = 5000
/** Past this, stop holding the app hostage: offer to keep using it. */
const DISMISS_MS = 15000

const { t } = useI18n()

const props = withDefaults(
  defineProps<{
    visible: boolean
    phase?: UpdatePhase
    progress?: number | null
    /** Mandatory update: the user gets no way past this screen. */
    forced?: boolean
    done?: number | null
    total?: number | null
    /** Version freshly installed, shown by the `done` phase. */
    version?: string | null
  }>(),
  { phase: 'applying', progress: null, forced: false, done: null, total: null, version: null },
)

const emit = defineEmits<{ dismiss: [] }>()

const showSlowHint = ref(false)
const showDismiss = ref(false)
let timers: ReturnType<typeof setTimeout>[] = []

const isDownloading = computed(() => props.phase === 'downloading')
const isApplying = computed(() => props.phase === 'applying')
/** The update already landed: this screen reports it rather than asking to wait. */
const isDone = computed(() => props.phase === 'done')

// Applying is near-instant; the gauge paces UPDATE_OVERLAY_MIN_MS so the screen
// resolves rather than snapping. Counted in whole percent because useCountUp is
// integer-valued — it is reused here so the fill eases like every other counter.
const { value: applyPercent } = useCountUp(() => 100, {
  from: 0,
  durationMs: UPDATE_OVERLAY_MIN_MS,
  active: isApplying,
})

/** `null` hands the gauge over to its indeterminate tide. */
const gaugeProgress = computed<number | null>(() => {
  if (isDone.value) return 1
  if (isApplying.value) return applyPercent.value / 100
  return props.progress
})
const percent = computed(() =>
  isDownloading.value && props.progress !== null ? Math.round(props.progress * 100) : null,
)

const title = computed(() => {
  if (isDone.value) return t('updateOverlay.doneTitle')
  return props.forced ? t('updateOverlay.forcedTitle') : t('updateOverlay.title')
})

const subtitle = computed(() => {
  if (isDone.value) return t('updateOverlay.doneSubtitle')
  if (isDownloading.value) return t('updateOverlay.downloadingSubtitle')
  return props.forced ? t('updateOverlay.forcedSubtitle') : t('updateOverlay.subtitle')
})

// A percentage says how far along; a file count says the thing is genuinely moving.
// Only meaningful while the bundle is actually coming down.
const fileCount = computed(() =>
  isDownloading.value && props.done !== null && props.total
    ? { done: props.done, total: props.total }
    : null,
)

function clearTimers(): void {
  timers.forEach(clearTimeout)
  timers = []
}

// The escalation is time-based, not phase-based: what matters to the user is how
// long they have been staring at this screen, whatever the worker is doing.
watch(
  () => props.visible,
  (visible) => {
    clearTimers()
    showSlowHint.value = false
    showDismiss.value = false
    // Nothing is pending in the `done` phase: there is no slowness to excuse and
    // nothing to escape from.
    if (!visible || isDone.value) return
    timers.push(setTimeout(() => (showSlowHint.value = true), SLOW_HINT_MS))
    // No escape offered when the update is mandatory. A download that truly fails
    // still releases the app on its own, from pwa.update.
    if (!props.forced) timers.push(setTimeout(() => (showDismiss.value = true), DISMISS_MS))
  },
  { immediate: true },
)

onUnmounted(clearTimers)
</script>

<style scoped>
.update-overlay {
  position: fixed;
  inset: 0;
  z-index: 10000;
  background: #000006;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}

.update-content {
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 28px;
}

.update-text {
  text-align: center;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.update-title {
  font-family: 'Rajdhani', sans-serif;
  font-weight: 700;
  font-size: 1.25rem;
  color: #a78bfa;
  letter-spacing: 0.05em;
  margin: 0;
}

.update-subtitle {
  font-size: 0.875rem;
  color: rgba(167, 139, 250, 0.6);
  margin: 0;
}

.update-progress-track {
  width: 200px;
  height: 3px;
  background: rgba(167, 139, 250, 0.15);
  border-radius: 2px;
  overflow: hidden;
}

.update-progress-bar {
  height: 100%;
  width: 0%;
  background: linear-gradient(90deg, #7c3aed, #a78bfa);
  border-radius: 2px;
}

/* Timed bar: the handover is near-instant, the bar just paces UPDATE_OVERLAY_MIN_MS. */
.update-progress-timed {
  animation: progress-fill 1.5s linear forwards;
}

@keyframes progress-fill {
  from {
    width: 0%;
  }
  to {
    width: 100%;
  }
}

/* Real precache progress, width driven by the worker's messages. */
.update-progress-measured {
  transition: width 0.25s ease-out;
}

/* Fallback while the worker has not reported anything yet. */
.update-progress-indeterminate {
  width: 40%;
  animation: progress-sweep 1.4s ease-in-out infinite;
}

@keyframes progress-sweep {
  0% {
    transform: translateX(-110%);
  }
  100% {
    transform: translateX(260%);
  }
}

.update-percent {
  font-family: 'Rajdhani', sans-serif;
  font-size: 0.8125rem;
  color: rgba(167, 139, 250, 0.75);
  margin: -18px 0 0;
  font-variant-numeric: tabular-nums;
}

.update-version {
  font-family: 'Rajdhani', sans-serif;
  font-size: 1.125rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  color: rgba(167, 139, 250, 0.9);
  margin: 0;
  font-variant-numeric: tabular-nums;
}

.update-files {
  font-family: 'Rajdhani', sans-serif;
  font-size: 0.75rem;
  color: rgba(167, 139, 250, 0.5);
  margin: -20px 0 0;
  font-variant-numeric: tabular-nums;
}

.update-hint {
  max-width: 260px;
  text-align: center;
  font-size: 0.75rem;
  line-height: 1.4;
  color: rgba(167, 139, 250, 0.45);
  margin: -14px 0 0;
  animation: hint-in 0.4s ease;
}

@keyframes hint-in {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

.update-dismiss {
  padding: 8px 18px;
  border: 1px solid rgba(167, 139, 250, 0.35);
  border-radius: 6px;
  background: transparent;
  color: #a78bfa;
  font-family: 'Rajdhani', sans-serif;
  font-weight: 700;
  font-size: 0.875rem;
  letter-spacing: 0.03em;
  cursor: pointer;
  transition:
    background 0.2s ease,
    border-color 0.2s ease;
  animation: hint-in 0.4s ease;
}

.update-dismiss:hover {
  background: rgba(167, 139, 250, 0.12);
  border-color: rgba(167, 139, 250, 0.6);
}

.update-fade-enter-active {
  transition: opacity 0.3s ease;
}
.update-fade-enter-from {
  opacity: 0;
}
</style>
