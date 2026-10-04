<template>
  <img
    v-if="photo"
    :src="photo.src"
    :srcset="photo.srcset"
    :sizes="photo.sizes"
    :alt="name"
    :title="name"
    loading="lazy"
    decoding="async"
    class="object-cover flex-shrink-0 bg-surface-700"
    :class="[sizeClass, shapeClass]"
    @error="failedVersion = photo.version"
  />
  <div
    v-else
    class="flex items-center justify-center font-bold uppercase text-white flex-shrink-0"
    :class="[sizeClass, shapeClass]"
    :style="{ background: getAvatarBg(colorKey ?? name) }"
  >
    {{ getInitials(name) }}
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { AVATAR_SIZES } from '@skol-arena/shared'
import { getInitials, getAvatarBg } from '@/utils/StringUtils'
import { avatarSizeClass, avatarSizePx, type AvatarSize } from '@/components/avatar-size'
import { useAvatarService } from '@/composables/avatar/avatar.service'

const props = defineProps<{
  name: string
  colorKey?: string
  size?: AvatarSize
  shape?: 'square' | 'circle'
  /** App user id. Without it, or while the avatar is unknown, the initials show. */
  playerId?: string | null
}>()

const { versionFor, avatarUrl, avatarSrcset } = useAvatarService()

/** A version whose image failed to load: fall back to initials until it changes. */
const failedVersion = ref<string | null>(null)

const sizeClass = computed(() => avatarSizeClass(props.size))
const shapeClass = computed(() =>
  props.shape === 'circle'
    ? 'rounded-full'
    : 'rounded-md border border-surface-900 ring-1 ring-surface-700/20',
)

const photo = computed(() => {
  if (!props.playerId) return null
  const version = versionFor(props.playerId)
  if (!version || version === failedVersion.value) return null
  const id = props.playerId
  return {
    version,
    src: avatarUrl(id, version, AVATAR_SIZES[0]),
    srcset: avatarSrcset(id, version),
    sizes: `${avatarSizePx(props.size)}px`,
  }
})
</script>
