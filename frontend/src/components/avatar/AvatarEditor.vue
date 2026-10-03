<template>
  <div class="flex items-center gap-4">
    <PlayerAvatar
      :name="name"
      :color-key="colorKey"
      :player-id="userId"
      size="xl"
      shape="square"
    />

    <div class="flex flex-col gap-2 min-w-0">
      <div class="flex flex-wrap gap-2">
        <Button
          :label="hasAvatar ? t('avatarEditor.change') : t('avatarEditor.upload')"
          icon="fa fa-camera"
          size="small"
          :loading="busy"
          @click="pickFile"
        />
        <Button
          v-if="hasAvatar"
          :label="t('avatarEditor.remove')"
          icon="fa fa-trash"
          size="small"
          severity="danger"
          outlined
          :disabled="busy"
          @click="confirmRemove"
        />
      </div>
      <small class="text-gray-500">{{ t('avatarEditor.hint', { max: maxLabel }) }}</small>
      <small v-if="error" class="text-red-500" role="alert">{{ error }}</small>
    </div>

    <input
      ref="fileInput"
      type="file"
      class="hidden"
      :accept="AVATAR_ACCEPTED_MIME.join(',')"
      data-testid="avatar-file-input"
      @change="onFileChosen"
    />

    <AvatarCropDialog
      v-model:visible="cropping"
      :file="chosenFile"
      :busy="busy"
      @cropped="upload"
      @unreadable="error = t('avatarEditor.unreadable')"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useConfirm } from 'primevue/useconfirm'
import { AVATAR_ACCEPTED_MIME, AVATAR_MAX_UPLOAD_BYTES_DEFAULT } from '@skol-arena/shared'
import PlayerAvatar from '@/components/PlayerAvatar.vue'
import AvatarCropDialog from '@/components/avatar/AvatarCropDialog.vue'
import { useAvatarService } from '@/composables/avatar/avatar.service'
import { useAppToast } from '@/composables/useAppToast'

/**
 * Raw files over this are refused before cropping. The crop exports a 512px square,
 * so what is actually uploaded is far smaller: this only spares the browser from
 * decoding something absurd. The server enforces its own limits regardless.
 */
const MAX_PICKED_BYTES = 4 * AVATAR_MAX_UPLOAD_BYTES_DEFAULT

const props = defineProps<{
  userId: string
  name: string
  colorKey?: string
}>()

const { t } = useI18n()
const confirm = useConfirm()
const toast = useAppToast()
const avatarService = useAvatarService()

const fileInput = ref<HTMLInputElement | null>(null)
const chosenFile = ref<File | null>(null)
const cropping = ref(false)
const busy = ref(false)
const error = ref<string | null>(null)

const hasAvatar = computed(() => !!avatarService.versionFor(props.userId))
const maxLabel = `${Math.round(MAX_PICKED_BYTES / (1024 * 1024))} MB`

function pickFile() {
  error.value = null
  fileInput.value?.click()
}

function onFileChosen(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0] ?? null
  // Reset so choosing the same file again still fires a change.
  input.value = ''
  if (!file) return
  if (!(AVATAR_ACCEPTED_MIME as readonly string[]).includes(file.type)) {
    error.value = t('avatarEditor.unsupported')
    return
  }
  if (file.size > MAX_PICKED_BYTES) {
    error.value = t('avatarEditor.tooLarge', { max: maxLabel })
    return
  }
  chosenFile.value = file
  cropping.value = true
}

async function upload(blob: Blob) {
  busy.value = true
  error.value = null
  try {
    await avatarService.upload(props.userId, blob)
    cropping.value = false
    toast.add({ severity: 'success', summary: t('avatarEditor.updated'), life: 3000 })
  } catch (err: unknown) {
    error.value = err instanceof Error ? err.message : t('avatarEditor.uploadError')
  } finally {
    busy.value = false
  }
}

function confirmRemove() {
  confirm.require({
    message: t('avatarEditor.confirmRemoveMessage'),
    header: t('avatarEditor.confirmRemoveHeader'),
    icon: 'fa fa-exclamation-triangle',
    acceptClass: 'p-button-danger',
    accept: remove,
  })
}

async function remove() {
  busy.value = true
  error.value = null
  try {
    await avatarService.remove(props.userId)
  } catch (err: unknown) {
    error.value = err instanceof Error ? err.message : t('avatarEditor.removeError')
  } finally {
    busy.value = false
  }
}
</script>
