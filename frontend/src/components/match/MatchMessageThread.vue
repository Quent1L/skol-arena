<template>
  <SurfacePanel>
    <template #header>
      <SectionHeader
        icon="fa fa-comments"
        :title="t('matchMessageThread.title')"
        :count="userMessageCount"
      />
    </template>

    <div class="space-y-4">
      <p class="font-label text-[11px] text-muted-color">
        <i class="fa fa-lock mr-1" aria-hidden="true" />
        {{ t('matchMessageThread.hint') }}
      </p>

      <div v-if="loading" class="space-y-2">
        <Skeleton height="2.5rem" class="rounded-xl!" />
        <Skeleton height="2.5rem" width="70%" class="rounded-xl!" />
      </div>

      <EmptyState
        v-else-if="messages.length === 0"
        icon="fa fa-comments"
        :title="t('matchMessageThread.empty')"
      />

      <ul v-else class="space-y-2">
        <li v-for="entry in renderedMessages" :key="entry.message.id">
          <!-- System messages are timeline events, not speech: a hairline, not a bubble -->
          <div
            v-if="entry.message.kind === 'system'"
            class="flex items-center gap-2 py-1"
          >
            <span class="h-px flex-1 bg-surface-700/60" aria-hidden="true" />
            <span class="font-label text-center text-[11px] uppercase tracking-wide text-muted-color">
              {{ renderBody(entry.message) }}
              <!-- An event is only readable against a timeline: say when it happened -->
              <span class="whitespace-nowrap text-white/40">
                · {{ formatDate(entry.message.createdAt) }}
              </span>
            </span>
            <span class="h-px flex-1 bg-surface-700/60" aria-hidden="true" />
          </div>

          <div v-else class="flex items-end gap-2" :class="entry.isOwn ? 'flex-row-reverse' : ''">
            <div class="w-7 shrink-0">
              <PlayerAvatar
                v-if="entry.showHeader && !entry.isOwn"
                :name="entry.message.author?.displayName || t('matchMessageThread.unknownAuthor')"
                :color-key="entry.message.author?.id"
                :player-id="entry.message.author?.id"
                size="sm"
              />
            </div>

            <div class="min-w-0 max-w-[80%]" :class="entry.isOwn ? 'text-right' : ''">
              <div
                v-if="entry.showHeader"
                class="font-label mb-0.5 flex items-baseline gap-2 text-[11px]"
                :class="entry.isOwn ? 'justify-end' : ''"
              >
                <span class="font-bold text-white/70">
                  {{ entry.message.author?.displayName || t('matchMessageThread.unknownAuthor') }}
                </span>
                <span class="text-muted-color">{{ formatDate(entry.message.createdAt) }}</span>
              </div>

              <!-- Bodies are plain text and interpolated, never injected as HTML -->
              <p
                class="inline-block whitespace-pre-wrap break-words rounded-2xl px-3 py-2 text-left text-sm"
                :class="
                  entry.isOwn
                    ? 'rounded-br-sm bg-primary/15 text-white/90'
                    : 'rounded-bl-sm bg-surface-700/50 text-white/90'
                "
              >
                {{ renderBody(entry.message) }}
              </p>
            </div>
          </div>
        </li>
      </ul>

      <!-- Composer. Collapsed to a single pill by default: the thread is mostly read, and
           a permanently open 3-row textarea dominated a panel that is usually empty. -->
      <div v-if="canPost">
        <button
          v-if="!composerOpen"
          type="button"
          class="composer-trigger group flex w-full items-center gap-2.5 rounded-2xl border border-surface-700/50 bg-surface-900/40 px-3 py-2.5 text-left transition-all duration-200 hover:border-primary/40 hover:bg-surface-900/70 active:scale-[0.99]"
          @click="openComposer"
        >
          <PlayerAvatar
            v-if="currentUserName"
            :name="currentUserName"
            :color-key="currentUserId"
            :player-id="currentUserId"
            size="sm"
          />
          <span class="flex-1 truncate text-sm text-muted-color">
            {{ t('matchMessageThread.placeholder') }}
          </span>
          <i
            class="fa fa-paper-plane text-sm text-muted-color transition-colors group-hover:text-primary"
            aria-hidden="true"
          />
        </button>

        <div
          v-else
          class="composer-open rounded-2xl border border-primary/40 bg-surface-900/60 p-2 ring-1 ring-primary/10"
        >
          <Textarea
            id="matchMessageBody"
            ref="composerInput"
            v-model="draft"
            rows="3"
            :maxlength="MATCH_MESSAGE_MAX_LENGTH"
            :placeholder="t('matchMessageThread.placeholder')"
            class="w-full resize-none border-0! bg-transparent! shadow-none! focus:ring-0!"
            @keydown.esc="closeComposerIfEmpty"
            @keydown.enter.ctrl.prevent="send"
            @keydown.enter.meta.prevent="send"
          />
          <div class="mt-1 flex items-center justify-between gap-2 px-1">
            <span
              class="font-label text-[11px] tabular-nums"
              :class="draft.length > MATCH_MESSAGE_MAX_LENGTH - 50 ? 'text-amber-400' : 'text-muted-color'"
            >
              {{ draft.length }} / {{ MATCH_MESSAGE_MAX_LENGTH }}
            </span>
            <div class="flex items-center gap-2">
              <Button
                :label="t('common.cancel')"
                severity="secondary"
                text
                size="small"
                :disabled="posting"
                @click="cancelComposer"
              />
              <Button
                :label="t('matchMessageThread.sendBtn')"
                icon="fa fa-paper-plane"
                size="small"
                rounded
                :disabled="draft.trim().length === 0 || posting"
                :loading="posting"
                @click="send"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  </SurfacePanel>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  MATCH_MESSAGE_MAX_LENGTH,
  type ClientMatchMessage,
} from '@skol-arena/shared/types/index'
import { useMatchMessageService } from '@/composables/match/match-message.service'
import PlayerAvatar from '@/components/PlayerAvatar.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import SectionHeader from '@/components/ui/SectionHeader.vue'
import SurfacePanel from '@/components/ui/SurfacePanel.vue'

interface Props {
  matchId: string
  canPost?: boolean
  currentUserId?: string
  currentUserName?: string
}

const props = defineProps<Props>()

const { t, te, locale } = useI18n()
const { messages, loading, posting, load, post, subscribe } = useMatchMessageService()

const draft = ref('')
const composerOpen = ref(false)
const composerInput = ref<{ $el: HTMLTextAreaElement } | null>(null)
let unsubscribe: (() => void) | null = null

/** Consecutive messages from one author inside this window share a single header. */
const GROUPING_WINDOW_MS = 5 * 60 * 1000

/**
 * The badge counts what people said, not what the match did: system events arrive on
 * their own and would make an untouched thread look busy.
 */
const userMessageCount = computed(
  () => messages.value.filter((m) => m.kind === 'user').length,
)

const renderedMessages = computed(() =>
  messages.value.map((message, index) => {
    const previous = index > 0 ? messages.value[index - 1] : null
    const sameAuthor =
      previous?.kind === 'user' &&
      message.kind === 'user' &&
      previous.author?.id === message.author?.id
    const withinWindow =
      !!previous &&
      new Date(message.createdAt).getTime() - new Date(previous.createdAt).getTime() <
        GROUPING_WINDOW_MS

    return {
      message,
      isOwn: message.kind === 'user' && !!props.currentUserId && message.author?.id === props.currentUserId,
      showHeader: !(sameAuthor && withinWindow),
    }
  }),
)

onMounted(async () => {
  await load(props.matchId)
  unsubscribe = subscribe(props.matchId)
})

onUnmounted(() => {
  unsubscribe?.()
})

watch(
  () => props.matchId,
  async (matchId) => {
    unsubscribe?.()
    await load(matchId)
    unsubscribe = subscribe(matchId)
  },
)

async function openComposer() {
  composerOpen.value = true
  await nextTick()
  composerInput.value?.$el?.focus()
}

/** Cancel is the only path that discards a draft, so typing is never lost by accident. */
function cancelComposer() {
  draft.value = ''
  composerOpen.value = false
}

function closeComposerIfEmpty() {
  if (draft.value.trim().length === 0) cancelComposer()
}

async function send() {
  if (draft.value.trim().length === 0 || posting.value) return
  const body = draft.value
  await post(props.matchId, body)
  draft.value = ''
  composerOpen.value = false
}

/**
 * System messages store an i18n key and its params, so they render in the reader's
 * language. User messages are shown verbatim.
 */
function renderBody(message: ClientMatchMessage): string {
  if (message.kind !== 'system') return message.body
  if (!te(message.body)) return message.body
  return t(message.body, message.translationParams ?? {})
}

function formatDate(date: Date | string): string {
  const value = date instanceof Date ? date : new Date(date)
  return new Intl.DateTimeFormat(locale.value, {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(value)
}
</script>

<style scoped>
.composer-open {
  animation: composer-expand 0.22s cubic-bezier(0.16, 1, 0.3, 1) both;
  transform-origin: top;
}

@keyframes composer-expand {
  from {
    opacity: 0;
    transform: scaleY(0.92) translateY(-4px);
  }
  to {
    opacity: 1;
    transform: none;
  }
}

@media (prefers-reduced-motion: reduce) {
  .composer-open {
    animation: none;
  }
  .composer-trigger {
    transition-duration: 0.01ms;
  }
}
</style>
