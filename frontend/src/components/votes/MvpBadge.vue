<template>
  <span
    class="font-headline inline-flex shrink-0 items-center gap-0.5 rounded-full border border-amber-400/40 bg-amber-400/15 px-1.5 py-0.5 text-[10px] font-black uppercase tracking-wide text-amber-300"
    :title="t('matchVotes.mvp.badgeTitle')"
    data-testid="mvp-badge"
  >
    <i class="fa fa-medal text-[9px]" aria-hidden="true" />
    MVP
  </span>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n'

/** Marks the frozen MVP of a match next to their name. */
const { t } = useI18n()
</script>
