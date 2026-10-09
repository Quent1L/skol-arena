# Schémas de Validation

Ce dossier contient les schémas de validation Zod des formulaires d'authentification, passés à `<UForm :schema>` (Nuxt UI).

## auth.schema.ts

Contient les schémas de validation pour l'authentification :

### `loginSchema`

- **email** : Email valide requis
- **password** : Minimum 8 caractères

### `registerSchema`

- **email** : Email valide requis
- **name** : Nom optionnel
- **password** : Minimum 8 caractères
- **passwordConfirm** : Doit correspondre au mot de passe

## Utilisation

```vue
<script setup lang="ts">
import { reactive } from 'vue'
import type { FormSubmitEvent } from '@nuxt/ui'
import { loginSchema, type LoginFormData } from '@/schemas/auth.schema'

const state = reactive<LoginFormData>({ email: '', password: '' })

function onSubmit({ data }: FormSubmitEvent<LoginFormData>) {
  // data is validated
}
</script>

<template>
  <UForm :schema="loginSchema" :state="state" @submit="onSubmit">
    <UFormField name="email" label="Email">
      <UInput v-model="state.email" />
    </UFormField>
  </UForm>
</template>
```
