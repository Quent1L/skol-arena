<template>
  <UInput
    v-model="model"
    :type="visible ? 'text' : 'password'"
    autocomplete="current-password"
    class="w-full"
    :ui="{ trailing: 'pe-1' }"
  >
    <template #trailing>
      <UButton
        color="neutral"
        variant="link"
        size="sm"
        :icon="visible ? 'i-fa7-solid:eye-slash' : 'i-fa7-solid:eye'"
        :aria-label="visible ? t('common.hidePassword') : t('common.showPassword')"
        :aria-pressed="visible"
        @click="visible = !visible"
      />
    </template>
  </UInput>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'

/** A password field with a show/hide toggle. Inside a UFormField it picks up the field's id. */
const model = defineModel<string>({ default: '' })

const { t } = useI18n()
const visible = ref(false)
</script>
