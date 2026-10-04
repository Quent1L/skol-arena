<template>
  <Dialog
    v-model:visible="visible"
    modal
    :header="t('avatarCropDialog.title')"
    :style="{ width: '22rem' }"
    :breakpoints="{ '480px': '95vw' }"
    @hide="release"
  >
    <div class="flex flex-col items-center gap-4">
      <div
        class="relative overflow-hidden rounded-lg bg-surface-900 touch-none select-none cursor-grab active:cursor-grabbing"
        :style="{ width: `${VIEW}px`, height: `${VIEW}px` }"
        data-testid="avatar-crop-viewport"
        @pointerdown="onPointerDown"
        @pointermove="onPointerMove"
        @pointerup="onPointerUp"
        @pointercancel="onPointerUp"
        @wheel.prevent="onWheel"
      >
        <canvas ref="canvasEl" class="block w-full h-full" />
        <!-- Darkens what falls outside the rounded square the avatar is shown in. -->
        <div
          class="pointer-events-none absolute inset-0 rounded-md"
          style="box-shadow: 0 0 0 9999px rgb(0 0 0 / 0.55)"
        />
      </div>

      <div class="flex w-full items-center gap-3">
        <i class="fa fa-image text-xs text-gray-400" />
        <Slider
          :model-value="zoom"
          :min="1"
          :max="MAX_ZOOM"
          :step="0.01"
          class="flex-1"
          :aria-label="t('avatarCropDialog.zoom')"
          @update:model-value="setZoom(Array.isArray($event) ? $event[0]! : $event)"
        />
        <i class="fa fa-image text-gray-400" />
      </div>
      <small class="text-gray-500 text-center">{{ t('avatarCropDialog.hint') }}</small>
    </div>

    <template #footer>
      <Button :label="t('common.cancel')" severity="secondary" text @click="visible = false" />
      <Button
        :label="t('avatarCropDialog.confirm')"
        icon="fa fa-check"
        :loading="busy"
        :disabled="!bitmap"
        @click="confirm"
      />
    </template>
  </Dialog>
</template>

<script setup lang="ts">
import { ref, watch, nextTick } from 'vue'
import { useI18n } from 'vue-i18n'

/** Viewport side, in CSS pixels. */
const VIEW = 280
/** Side of the exported square: the largest variant the server keeps, for the full-screen view. */
const OUTPUT = 1024
const MAX_ZOOM = 4

const props = defineProps<{ file: File | null; busy?: boolean }>()
const emit = defineEmits<{ cropped: [blob: Blob]; unreadable: [] }>()
const visible = defineModel<boolean>('visible', { required: true })

const { t } = useI18n()

const canvasEl = ref<HTMLCanvasElement | null>(null)
const bitmap = ref<ImageBitmap | null>(null)
const zoom = ref(1)
/** Top-left corner of the image, relative to the viewport, in CSS pixels. */
const offset = ref({ x: 0, y: 0 })
let drag: { x: number; y: number; pointerId: number } | null = null

/** Smallest scale at which the image still covers the whole viewport. */
function coverScale(img: ImageBitmap): number {
  return Math.max(VIEW / img.width, VIEW / img.height)
}

function scale(): number {
  return bitmap.value ? coverScale(bitmap.value) * zoom.value : 1
}

/** Keeps the image covering the viewport: no empty band may show. */
function clamp(x: number, y: number) {
  const img = bitmap.value
  if (!img) return { x, y }
  const w = img.width * scale()
  const h = img.height * scale()
  return {
    x: Math.min(0, Math.max(VIEW - w, x)),
    y: Math.min(0, Math.max(VIEW - h, y)),
  }
}

function draw() {
  const canvas = canvasEl.value
  const img = bitmap.value
  if (!canvas || !img) return
  const dpr = window.devicePixelRatio || 1
  canvas.width = VIEW * dpr
  canvas.height = VIEW * dpr
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.imageSmoothingQuality = 'high'
  const s = scale()
  ctx.drawImage(img, offset.value.x, offset.value.y, img.width * s, img.height * s)
}

function centre() {
  const img = bitmap.value
  if (!img) return
  const s = scale()
  offset.value = clamp((VIEW - img.width * s) / 2, (VIEW - img.height * s) / 2)
}

async function load(file: File) {
  release()
  try {
    // The browser applies EXIF orientation, so what is cropped is what was seen.
    bitmap.value = await createImageBitmap(file, { imageOrientation: 'from-image' })
  } catch {
    emit('unreadable')
    visible.value = false
    return
  }
  zoom.value = 1
  centre()
  await nextTick()
  draw()
}

function release() {
  bitmap.value?.close()
  bitmap.value = null
  drag = null
}

/**
 * Zooms around the viewport centre rather than the top-left corner. Called by the
 * user's gestures only: a watcher would also fire on the reset in load() and
 * shift an image that has just been centred.
 */
function setZoom(next: number) {
  const prev = zoom.value
  zoom.value = Math.min(MAX_ZOOM, Math.max(1, next))
  if (!bitmap.value || zoom.value === prev) return
  const ratio = zoom.value / prev
  const c = VIEW / 2
  offset.value = clamp(c - (c - offset.value.x) * ratio, c - (c - offset.value.y) * ratio)
  draw()
}

watch(
  () => [props.file, visible.value] as const,
  ([file, open]) => {
    if (file && open) void load(file)
  },
  { immediate: true },
)

function onPointerDown(e: PointerEvent) {
  ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  drag = { x: e.clientX - offset.value.x, y: e.clientY - offset.value.y, pointerId: e.pointerId }
}

function onPointerMove(e: PointerEvent) {
  if (!drag || drag.pointerId !== e.pointerId) return
  offset.value = clamp(e.clientX - drag.x, e.clientY - drag.y)
  draw()
}

function onPointerUp() {
  drag = null
}

function onWheel(e: WheelEvent) {
  setZoom(zoom.value - e.deltaY * 0.002)
}

function toBlob(canvas: HTMLCanvasElement): Promise<Blob | null> {
  // A browser without a WebP encoder silently hands back a PNG, which is accepted too.
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/webp', 0.9))
}

/** Exports the visible square, never upscaled beyond what the source holds. */
async function confirm() {
  const img = bitmap.value
  if (!img) return
  const s = scale()
  const sourceSide = VIEW / s
  const side = Math.max(1, Math.min(OUTPUT, Math.round(sourceSide)))
  const out = document.createElement('canvas')
  out.width = side
  out.height = side
  const ctx = out.getContext('2d')
  if (!ctx) return
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(img, -offset.value.x / s, -offset.value.y / s, sourceSide, sourceSide, 0, 0, side, side)
  const blob = await toBlob(out)
  if (blob) emit('cropped', blob)
  else emit('unreadable')
}
</script>
