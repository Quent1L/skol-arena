<template>
  <!-- On a match card (itself a link) the medal alone is enough; title + aria-label name it. -->
  <span
    v-if="iconOnly"
    class="inline-flex size-4 shrink-0 items-center justify-center rounded-full bg-amber-400/15 text-amber-300 ring-1 ring-amber-400/40"
    :title="t('matchVotes.mvp.badgeTitle')"
    :aria-label="t('matchVotes.mvp.badgeTitle')"
    role="img"
    data-testid="mvp-badge"
  >
    <i class="fa fa-medal text-[8px]" aria-hidden="true" />
  </span>
  <!-- A popover rather than UTooltip, which never opens on touch (see InfoTooltip). -->
  <UPopover v-else mode="hover" enable-touch :content="{ side: 'top', sideOffset: 6 }">
    <button
      type="button"
      class="font-headline inline-flex shrink-0 cursor-help items-center gap-0.5 rounded-full border border-amber-400/40 bg-amber-400/15 px-1.5 py-0.5 text-xs font-black sm:text-[10px] uppercase tracking-wide text-amber-300 focus:outline-none"
      :aria-label="t('matchVotes.mvp.badgeTitle')"
      data-testid="mvp-badge"
    >
      <!-- The medal alone on mobile spares the name. `.fa` has line-height 1, so the icon
           sits in a span carrying text-xs's line height: same height as the points pill. -->
      <span><i class="fa fa-medal text-[9px]" aria-hidden="true" /></span>
      <span class="hidden sm:inline">MVP</span>
    </button>
    <template #content>
      <div class="max-w-xs px-3 py-2 text-sm">{{ t('matchVotes.mvp.badgeTitle') }}</div>
    </template>
  </UPopover>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n'

/** Marks the frozen MVP of a match next to their name. */
defineProps<{ iconOnly?: boolean }>()
const { t } = useI18n()
</script>
