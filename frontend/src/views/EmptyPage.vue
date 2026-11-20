<template>
  <div>
    <h1 class="text-2xl font-bold text-center mt-12 text-gray-900 dark:text-white">
      {{ t('emptyPage.title') }}
    </h1>
    <p class="mt-4 text-center text-gray-600 dark:text-gray-400">
      {{ t('emptyPage.description') }}
    </p>
  </div>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n'

const { t } = useI18n()
</script>
