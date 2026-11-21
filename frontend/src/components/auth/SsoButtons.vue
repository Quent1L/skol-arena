<template>
  <UButton
    v-for="provider in providers"
    :key="provider.id"
    type="button"
    size="xl"
    block
    color="neutral"
    :variant="variant"
    icon="i-fa7-solid:building"
    :loading="pending === provider.id"
    :disabled="disabled || pending !== null"
    :label="pending === provider.id ? t('auth.sso.redirecting') : labelOf(provider)"
    @click="start(provider.id)"
  />
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import type { OidcProvider } from '@skol-arena/shared'
import { authClient } from '@/lib/auth-client'

const props = withDefaults(
  defineProps<{
    providers: OidcProvider[]
    /** Sign-up flow: asks Better Auth to create the account. */
    signUp?: boolean
    disabled?: boolean
    variant?: 'outline' | 'subtle'
    /** Runs right before the redirect, e.g. to leave the invitation code in a cookie. */
    prepare?: () => void
  }>(),
  { variant: 'outline', prepare: undefined },
)

const emit = defineEmits<{ error: [message: string] }>()

const { t } = useI18n()
const pending = ref<string | null>(null)

function labelOf(provider: OidcProvider): string {
  if (provider.label) return provider.label
  const name = provider.id.charAt(0).toUpperCase() + provider.id.slice(1)
  return t(props.signUp ? 'auth.sso.signUp' : 'auth.sso.signIn', { name })
}

async function start(provider: string) {
  pending.value = provider
  try {
    props.prepare?.()
    // In dev the frontend is not served by the backend: the callback needs the full URL.
    const callbackURL = import.meta.env.MODE === 'dev' ? 'http://localhost:5173/' : '/'
    const { error } = await authClient.signIn.social({
      provider,
      callbackURL,
      requestSignUp: props.signUp || undefined,
    })
    if (error) throw new Error(error.message || t('auth.sso.error'))
  } catch (err: unknown) {
    pending.value = null
    emit('error', err instanceof Error ? err.message : t('auth.sso.error'))
  }
}
</script>
