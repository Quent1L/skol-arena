<template>
  <div class="w-full flex items-center justify-center h-full">
    <div class="text-center space-y-6 p-6">
      <SkolLogo class="mx-auto"></SkolLogo>

      <p class="text-xl md:text-2xl text-white/90 drop-shadow-md">{{ t('publicHomeView.tagline') }}</p>

      <p class="text-lg text-white/80 max-w-xl mx-auto drop-shadow-md">
        {{ t('publicHomeView.description') }}
      </p>

      <div class="flex flex-col sm:flex-row gap-4 justify-center pt-4">
        <UButton
          :label="t('publicHomeView.enterApp')"
          @click="$router.push('/')"
          class="text-lg"
          size="xl"
        />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import SkolLogo from '@/components/brand/SkolLogo.vue'

const { t } = useI18n()
</script>
