<template>
  <div
    v-if="promoted"
    class="relative overflow-hidden rounded-2xl bg-gradient-to-r from-indigo-600 to-purple-700 p-5 text-white shadow-lg"
  >
    <i
      class="fa fa-film pointer-events-none absolute -right-4 -top-4 text-8xl text-white/10"
      aria-hidden="true"
    />

    <div class="relative flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div class="min-w-0">
        <div class="text-[11px] font-semibold uppercase tracking-widest text-indigo-200">
          {{ t('rewind.promo.eyebrow') }}
        </div>
        <h2 class="truncate text-lg font-black">
          {{ t('rewind.promo.title', { season: promoted.seasonName }) }}
        </h2>
        <p v-if="subtitle" class="text-sm text-indigo-100">
          {{ subtitle }}
        </p>
      </div>

      <UButton
        color="neutral"
        :label="t('rewind.promo.action')"
        icon="i-fa7-solid:play"
        class="shrink-0"
        @click="launch(promoted.seasonId)"
        size="lg"
      />
    </div>
  </div>

  <!--
    Outside the banner on purpose: watching the deck through clears the
    promotion, so a launcher nested in `v-if="promoted"` would unmount itself —
    and the overlay with it — the moment the player reaches the last card.
  -->
  <RewindLauncher v-if="launchedSeasonId" v-model:open="open" :season-id="launchedSeasonId" />
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRewindService, daysUntil } from '@/composables/ranked/rewind.service'
import RewindLauncher from './RewindLauncher.vue'

const { t } = useI18n()
const { promoted, loadPromoted } = useRewindService()

// Discipline and remaining window, whichever of the two we actually have — the
// separator only shows up when there is something on both sides of it.
const subtitle = computed(() => {
  if (!promoted.value) return ''
  const parts: string[] = []
  if (promoted.value.disciplineName) parts.push(promoted.value.disciplineName)
  const days = daysUntil(promoted.value.promotedUntil)
  if (days > 0) parts.push(t('rewind.promo.daysLeft', days))
  return parts.join(' · ')
})

const open = ref(false)
const launchedSeasonId = ref<string | null>(null)

function launch(seasonId: string): void {
  launchedSeasonId.value = seasonId
  open.value = true
}

onMounted(loadPromoted)
</script>
