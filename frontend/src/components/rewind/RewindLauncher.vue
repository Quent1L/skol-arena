<template>
  <SeasonRewind
    v-if="open"
    :bundle="bundle"
    :loading="loading"
    @close="close"
    @complete="onComplete"
    @join="onJoin"
  />
</template>

<script setup lang="ts">
import { watch } from 'vue'
import { useRouter } from 'vue-router'
import { useRewindService } from '@/composables/ranked/rewind.service'
import { useAuth } from '@/composables/useAuth'
import SeasonRewind from './SeasonRewind.vue'
import { holdScreenWhile } from '@/composables/useScreenTakeover'

/**
 * Single place that owns opening a rewind: loading the bundle, stamping the
 * first open and marking it watched. Every entry point (home banner, season
 * page auto-open, stats tab, archive) mounts this rather than repeating the
 * lifecycle — which is what keeps `opened` and `viewed` from drifting apart.
 */
const props = defineProps<{ seasonId: string | null; open: boolean }>()

// A full-screen moment: secondary messages wait for it to close.
holdScreenWhile(() => props.open)
const emit = defineEmits<{ (e: 'update:open', value: boolean): void }>()

const router = useRouter()
const { isAuthenticated } = useAuth()
const { bundle, loading, loadBundle, markOpened, markViewed } = useRewindService()

watch(
  () => [props.open, props.seasonId] as const,
  async ([isOpen, seasonId]) => {
    if (!isOpen || !seasonId) return
    if (bundle.value?.season.season.seasonId !== seasonId) {
      await loadBundle(seasonId, isAuthenticated.value)
    }
    if (isAuthenticated.value) await markOpened(seasonId)
  },
  { immediate: true },
)

function close(): void {
  emit('update:open', false)
}

async function onComplete(): Promise<void> {
  if (props.seasonId && isAuthenticated.value) await markViewed(props.seasonId)
}

function onJoin(seasonId: string): void {
  close()
  router.push(`/tournaments/${seasonId}`)
}
</script>
