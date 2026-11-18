<template>
  <section v-if="config" data-testid="vote-config-section">
    <h2 class="mb-1 text-lg font-semibold text-highlighted">{{ t('voteConfigSection.title') }}</h2>
    <p class="mb-4 text-sm text-muted">{{ t('voteConfigSection.description') }}</p>

    <div class="grid grid-cols-1 gap-6 lg:grid-cols-2">
      <div class="space-y-4">
        <USwitch v-model="config.fairPlayEnabled" :label="t('voteConfigSection.fairPlayEnabled')" />
        <template v-if="config.fairPlayEnabled">
          <UFormField :label="t('voteConfigSection.fairPlayMinVotes')" :help="t('voteConfigSection.fairPlayMinVotesHelp')">
            <UInputNumber v-model="config.fairPlayMinVotes" :min="1" :max="100" class="w-40" />
          </UFormField>
          <UFormField :label="t('voteConfigSection.fairPlayAlertThreshold')" :help="t('voteConfigSection.fairPlayAlertThresholdHelp')">
            <UInputNumber v-model="config.fairPlayAlertThreshold" :min="1" :max="100" class="w-40" />
          </UFormField>
          <USwitch v-model="config.fairPlayPublicNegativeAward" :label="t('voteConfigSection.publicNegativeAward')" />
          <p class="text-xs text-muted">{{ t('voteConfigSection.transparency') }}</p>
        </template>
      </div>

      <div class="space-y-4">
        <USwitch v-model="config.mvpEnabled" :label="t('voteConfigSection.mvpEnabled')" />
        <template v-if="config.mvpEnabled">
          <USwitch v-model="config.mvpSpectatorsEnabled" :label="t('voteConfigSection.mvpSpectatorsEnabled')" />
          <UFormField :label="t('voteConfigSection.mvpMinVotes')">
            <UInputNumber v-model="config.mvpMinVotes" :min="1" :max="100" class="w-40" />
          </UFormField>
          <UFormField :label="t('voteConfigSection.mvpTieRule')">
            <USelect v-model="config.mvpTieRule" :items="tieRuleItems" class="w-full sm:w-64" />
          </UFormField>
          <UFormField :label="t('voteConfigSection.mvpSameTargetLimit')">
            <USelect v-model="config.mvpSameTargetLimit" :items="limitItems" class="w-full sm:w-64" />
          </UFormField>
        </template>
      </div>
    </div>

    <div v-if="config.fairPlayEnabled || config.mvpEnabled" class="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
      <UFormField :label="t('voteConfigSection.promptMaxMatchAge')" :help="t('voteConfigSection.promptMaxMatchAgeHelp')">
        <UInputNumber v-model="config.promptMaxMatchAgeMinutes" :min="1" :max="1440" class="w-40" />
      </UFormField>
      <USwitch v-model="config.rewindVoterAwards" :label="t('voteConfigSection.rewindVoterAwards')" />
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { VoteConfigState } from './section-state'

/**
 * Fair-play / MVP vote settings. Never weighs on a result: always editable. The parent
 * seeds `voteConfig` with `resolveVoteConfig(...)`, so every knob has a value.
 */
const state = defineModel<VoteConfigState>('state', { required: true })
const { t } = useI18n()

const config = computed(() => state.value.voteConfig)

const tieRuleItems = computed(() => [
  { label: t('voteConfigSection.tieRule.co_mvp'), value: 'co_mvp' },
  { label: t('voteConfigSection.tieRule.none'), value: 'none' },
])
const limitItems = computed(() => [
  { label: t('voteConfigSection.limit.none'), value: 'none' },
  { label: t('voteConfigSection.limit.daily'), value: 'daily' },
  { label: t('voteConfigSection.limit.weekly'), value: 'weekly' },
])
</script>
