<template>
  <USelect
    v-model="currentLocale"
    :items="availableLocales"
    value-key="code"
    label-key="label"
    color="neutral"
    variant="ghost"
    :aria-label="t('settings.language.label')"
    class="w-36"
    data-testid="locale-switcher"
  >
    <template #leading>
      <span>{{ currentLocaleFlag }}</span>
    </template>
    <template #item-leading="{ item }">
      <span>{{ item.flag }}</span>
    </template>
  </USelect>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useLocale } from '@/composables/useLocale'

// Language picker for the screens reached before signing in, where Settings is out of reach.
const { t } = useI18n()
const { currentLocale, availableLocales } = useLocale()
const currentLocaleFlag = computed(
  () => availableLocales.find((l) => l.code === currentLocale.value)?.flag,
)
</script>
