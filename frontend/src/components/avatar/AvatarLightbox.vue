<template>
  <Teleport to="body">
    <Transition
      enter-active-class="transition-opacity duration-150"
      leave-active-class="transition-opacity duration-150"
      enter-from-class="opacity-0"
      leave-to-class="opacity-0"
    >
      <!-- A bare overlay rather than a Dialog: no frame around the photo, and nothing
           that could scroll — the image is bounded by the viewport. -->
      <div
        v-if="visible && photo"
        role="dialog"
        aria-modal="true"
        :aria-label="name"
        class="fixed inset-0 z-[1100] flex items-center justify-center bg-black/85"
        data-testid="avatar-lightbox"
        @click.self="close"
      >
        <!-- Avatars are cropped square, so the box can take its final size up front:
             nothing jumps when the full image lands. -->
        <div class="relative w-[min(90vw,90vh)] aspect-square" @click.self="close">
          <div
            v-if="status === 'error'"
            class="absolute inset-0 flex flex-col items-center justify-center gap-3 rounded-xl bg-surface-800 px-6 text-center"
            role="alert"
            data-testid="avatar-lightbox-error"
          >
            <i class="fa fa-image text-4xl text-surface-500" />
            <p class="font-semibold text-white">{{ t('avatarLightbox.loadFailed') }}</p>
            <p class="text-sm text-surface-400">{{ t('avatarLightbox.loadFailedHint') }}</p>
            <Button
              :label="t('avatarLightbox.retry')"
              icon="fa fa-rotate-right"
              severity="secondary"
              size="small"
              data-testid="avatar-lightbox-retry"
              @click="retry"
            />
          </div>

          <template v-else>
            <!-- Held back a moment: a cached or fast image should just appear, without a
                 spinner flashing in front of it. -->
            <div
              v-if="spinnerVisible"
              class="absolute inset-0 flex flex-col items-center justify-center gap-2 rounded-xl bg-surface-800 text-white"
              role="status"
              data-testid="avatar-lightbox-loading"
            >
              <i class="fa fa-spinner fa-spin text-3xl" />
              <span class="text-sm text-surface-300">{{ t('avatarLightbox.loading') }}</span>
            </div>
            <img
              :key="attempt"
              :src="photo.src"
              :srcset="photo.srcset"
              sizes="min(90vw, 90vh)"
              :alt="name"
              decoding="async"
              class="absolute inset-0 w-full h-full rounded-xl object-contain transition-opacity duration-200"
              :class="status === 'loaded' ? 'opacity-100' : 'opacity-0'"
              data-testid="avatar-lightbox-image"
              @load="status = 'loaded'"
              @error="status = 'error'"
            />
          </template>
        </div>

        <button
          ref="closeButton"
          type="button"
          :aria-label="t('common.close')"
          class="absolute top-4 right-4 w-10 h-10 rounded-full flex items-center justify-center bg-white/10 hover:bg-white/20 text-white transition-colors"
          @click="close"
        >
          <i class="fa fa-xmark text-lg" />
        </button>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { onKeyStroke, useScrollLock, useTimeoutFn } from '@vueuse/core'
import { AVATAR_SIZES } from '@skol-arena/shared'
import Button from 'primevue/button'
import { useAvatarService } from '@/composables/avatar/avatar.service'

/** A player's photo at full screen, from the largest variant the screen calls for. */
const props = defineProps<{ playerId: string; name: string }>()
const visible = defineModel<boolean>('visible', { required: true })

const { t } = useI18n()
const { versionFor, avatarUrl, avatarSrcset } = useAvatarService()

const closeButton = ref<HTMLButtonElement | null>(null)
const pageLocked = useScrollLock(typeof document === 'undefined' ? null : document.body)

const status = ref<'loading' | 'loaded' | 'error'>('loading')
/** Bumped by a retry: re-keys the <img> so the browser requests it again. */
const attempt = ref(0)

/** How long a load may take before it is worth showing a spinner. */
const SPINNER_DELAY_MS = 300
const spinnerVisible = ref(false)
const spinnerTimer = useTimeoutFn(() => (spinnerVisible.value = true), SPINNER_DELAY_MS, {
  immediate: false,
})

watch(
  status,
  (value) => {
    spinnerVisible.value = false
    if (value === 'loading') spinnerTimer.start()
    else spinnerTimer.stop()
  },
  { immediate: true },
)

const photo = computed(() => {
  const version = versionFor(props.playerId)
  if (!version) return null
  return {
    version,
    src: avatarUrl(props.playerId, version, AVATAR_SIZES[AVATAR_SIZES.length - 1]),
    srcset: avatarSrcset(props.playerId, version),
  }
})

function close() {
  visible.value = false
}

function retry() {
  status.value = 'loading'
  attempt.value++
}

onKeyStroke('Escape', () => {
  if (visible.value) close()
})

// A new photo starts over: the outcome of the previous one says nothing about it.
watch(
  () => photo.value?.version,
  () => {
    status.value = 'loading'
  },
)

// The page behind must not scroll while the photo covers it; focus moves onto the
// overlay so Escape and the close button are reachable from the keyboard.
watch(
  visible,
  async (open) => {
    pageLocked.value = open
    if (!open) return
    if (status.value === 'error') retry()
    await nextTick()
    closeButton.value?.focus()
  },
  { immediate: true },
)
</script>
