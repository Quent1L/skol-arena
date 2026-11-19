<template>
  <UForm :schema="createAnnouncementSchema" :state="state" class="space-y-4" @submit="onSubmit">
    <UFormField
      v-if="allowGlobal"
      name="audience"
      :label="t('announcementForm.audienceLabel')"
    >
      <URadioGroup
        v-model="state.audience"
        :items="audienceItems"
        orientation="horizontal"
        data-testid="announcement-audience"
      />
    </UFormField>

    <UFormField
      v-if="allowGlobal && state.audience === 'tournament'"
      name="tournamentId"
      :label="t('announcementForm.tournamentLabel')"
      required
    >
      <USelectMenu
        v-model.nullable="state.tournamentId"
        :items="tournamentOptions"
        value-key="value"
        :placeholder="t('announcementForm.tournamentPlaceholder')"
        class="w-full"
      />
    </UFormField>

    <UFormField name="title" :label="t('announcementForm.titleLabel')" required>
      <UInput
        v-model="state.title"
        :maxlength="ANNOUNCEMENT_TITLE_MAX"
        :placeholder="t('announcementForm.titlePlaceholder')"
        class="w-full"
      />
    </UFormField>

    <UFormField
      name="body"
      :label="t('announcementForm.bodyLabel')"
      :hint="`${state.body.length}/${ANNOUNCEMENT_BODY_MAX}`"
      required
    >
      <UTextarea
        v-model="state.body"
        :rows="5"
        autoresize
        :maxlength="ANNOUNCEMENT_BODY_MAX"
        :placeholder="t('announcementForm.bodyPlaceholder')"
        class="w-full"
      />
    </UFormField>

    <UFormField
      name="expiresAt"
      :label="t('announcementForm.expiresAtLabel')"
      :help="t('announcementForm.expiresAtHelp')"
    >
      <div class="flex items-center gap-2">
        <UInputDate v-model="expiresOn" :min-value="tomorrow" class="w-full" data-testid="announcement-expires" />
        <UButton
          v-if="expiresOn"
          icon="i-fa7-solid:xmark"
          color="neutral"
          variant="ghost"
          :aria-label="t('announcementForm.expiresAtClear')"
          @click="expiresOn = undefined"
        />
      </div>
    </UFormField>

    <UFormField name="asPopup" :label="t('announcementForm.channelsLabel')">
      <!-- Explicit ids: the field hands its single id to every input inside it, so both
           labels would otherwise point at the first checkbox. -->
      <div class="space-y-2">
        <UCheckbox
          id="announcement-in-feed"
          v-model="state.inFeed"
          :label="t('announcementForm.inFeedLabel')"
          :description="t('announcementForm.inFeedDescription')"
        />
        <UCheckbox
          id="announcement-as-popup"
          v-model="state.asPopup"
          :label="t('announcementForm.asPopupLabel')"
          :description="popupDescription"
        />
      </div>
    </UFormField>

    <div class="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
      <UButton
        color="neutral"
        variant="ghost"
        :label="t('common.cancel')"
        class="justify-center"
        :disabled="saving"
        @click="emit('cancel')"
      />
      <UButton
        type="submit"
        icon="i-fa7-solid:paper-plane"
        :label="t('announcementForm.submit')"
        class="justify-center"
        :loading="saving"
      />
    </div>
  </UForm>
</template>

<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import { getLocalTimeZone, today, type CalendarDate } from '@internationalized/date'
import { endOfLocalDay } from '@/utils/calendar-date'
import { useI18n } from 'vue-i18n'
import {
  ANNOUNCEMENT_BODY_MAX,
  ANNOUNCEMENT_TITLE_MAX,
  createAnnouncementSchema,
  type AnnouncementAudience,
  type CreateAnnouncementInput,
} from '@skol-arena/shared'

const props = withDefaults(
  defineProps<{
    /** Fixed target when published from a tournament's page. */
    tournamentId?: string | null
    /** Super admins only: lets the author pick the whole app or any tournament. */
    allowGlobal?: boolean
    tournamentOptions?: Array<{ label: string; value: string; icon?: string }>
    saving?: boolean
  }>(),
  { tournamentId: null, allowGlobal: false, tournamentOptions: () => [], saving: false },
)

const emit = defineEmits<{ submit: [payload: CreateAnnouncementInput]; cancel: [] }>()

const { t } = useI18n()

const state = reactive<{
  title: string
  body: string
  audience: AnnouncementAudience
  tournamentId: string | null
  inFeed: boolean
  asPopup: boolean
}>({
  title: '',
  body: '',
  audience: props.allowGlobal && !props.tournamentId ? 'all' : 'tournament',
  tournamentId: props.tournamentId,
  inFeed: true,
  asPopup: true,
})

/** The last day the pop-up shows, included. Unset: it never expires. */
const expiresOn = ref<CalendarDate | undefined>()
const tomorrow = today(getLocalTimeZone()).add({ days: 1 })

const audienceItems = computed(() => [
  { label: t('announcementForm.audienceAll'), value: 'all' },
  { label: t('announcementForm.audienceTournament'), value: 'tournament' },
])

const popupDescription = computed(() =>
  state.audience === 'all'
    ? t('announcementForm.asPopupDescriptionApp')
    : t('announcementForm.asPopupDescriptionTournament'),
)

function onSubmit() {
  emit('submit', {
    title: state.title.trim(),
    body: state.body.trim(),
    audience: state.audience,
    tournamentId: state.audience === 'tournament' ? state.tournamentId : null,
    inFeed: state.inFeed,
    asPopup: state.asPopup,
    expiresAt: endOfLocalDay(expiresOn.value) ?? null,
  })
}
</script>
