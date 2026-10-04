import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useAppToast } from '@/composables/useAppToast'
import { onWsEvent } from '@/composables/notification/notification.socket'
import type { ClientMatchMessage } from '@skol-arena/shared/types/index'
import { matchMessageApi } from './match-message.api'

/**
 * Discussion thread of a single match. State is per-instance: a component owns the
 * thread it displays, unlike the notification list which is global.
 */
export function useMatchMessageService() {
  const toast = useAppToast()
  const { t } = useI18n()

  const messages = ref<ClientMatchMessage[]>([])
  const loading = ref(false)
  const posting = ref(false)

  const load = async (matchId: string): Promise<void> => {
    try {
      loading.value = true
      messages.value = await matchMessageApi.list(matchId)
    } catch (err) {
      console.error('Error loading match messages:', err)
      messages.value = []
    } finally {
      loading.value = false
    }
  }

  const post = async (matchId: string, body: string): Promise<void> => {
    const trimmed = body.trim()
    if (trimmed.length === 0) return

    try {
      posting.value = true
      const message = await matchMessageApi.post(matchId, trimmed)
      appendUnlessKnown(message)
    } catch (err) {
      const detail = err instanceof Error ? err.message : t('matchMessageThread.errors.postFailed')
      toast.add({
        severity: 'error',
        summary: t('common.error'),
        detail,
        life: 5000,
      })
      throw err
    } finally {
      posting.value = false
    }
  }

  /**
   * The author receives their own message twice: once as the POST response, once over
   * the socket. Keying on the id keeps a single copy either way.
   */
  const appendUnlessKnown = (message: ClientMatchMessage): void => {
    if (messages.value.some((existing) => existing.id === message.id)) return
    messages.value = [...messages.value, message]
  }

  /**
   * Live updates for one match. Returns the unsubscribe function to call on unmount.
   */
  const subscribe = (matchId: string): (() => void) => {
    return onWsEvent('match_message', (payload) => {
      const message = payload as ClientMatchMessage
      if (message?.matchId !== matchId) return
      appendUnlessKnown({ ...message, createdAt: new Date(message.createdAt) })
    })
  }

  return {
    messages,
    loading,
    posting,
    load,
    post,
    subscribe,
  }
}
