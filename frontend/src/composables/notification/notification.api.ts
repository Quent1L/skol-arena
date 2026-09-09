import http from '@/config/ApiConfig'
import type { NotificationType } from '@skol-arena/shared'

export interface RawNotification {
  id: string
  /** Drives the icon and accent the card is drawn with */
  type: NotificationType
  /** Rendered server-side, used as a fallback when titleKey/messageKey are unknown here */
  title: string
  message: string
  /** Raw keys + params, rendered client-side with this device's locale and timezone */
  titleKey?: string
  messageKey?: string
  translationParams?: Record<string, unknown> | null
  actionUrl: string | null
  requiresAction: boolean
  /** The action this notification asked for is settled — it no longer blocks deletion */
  actionResolved?: boolean
  isRead: boolean
  actionCompleted?: boolean
  createdAt: Date // Converted by convertStringDatesToJS interceptor
}

export interface NotificationPage {
  data: RawNotification[]
  hasMore: boolean
  nextCursor: string | null
  /** Counted over the whole feed — the loaded list is only a page of it */
  unreadCount: number
  total: number
}

export interface BulkNotificationResult {
  affected: number
  /** Left in place because the action they ask for is still owed */
  kept: number
}

const BASE_URL = '/api'

export const notificationApi = {
  async list(params: { limit?: number; cursor?: string } = {}): Promise<NotificationPage> {
    const res = await http.get<NotificationPage>(`${BASE_URL}/me/notifications`, { params })
    return res.data
  },
  async markAllRead(): Promise<BulkNotificationResult> {
    const res = await http.post<BulkNotificationResult>(`${BASE_URL}/me/notifications/read-all`)
    return res.data
  },
  async deleteAll(): Promise<BulkNotificationResult> {
    const res = await http.delete<BulkNotificationResult>(`${BASE_URL}/me/notifications`)
    return res.data
  },
  async markRead(id: string): Promise<void> {
    await http.post(`${BASE_URL}/me/notifications/${id}/read`)
  },
  async markActionCompleted(id: string): Promise<void> {
    await http.post(`${BASE_URL}/me/notifications/${id}/action-completed`)
  },
  async registerPushDevice(payload: { subscriptionEndpoint: string; subscriptionData: unknown; deviceType: 'WEB' | 'ANDROID' | 'IOS'; locale?: string; timezone?: string }): Promise<void> {
    await http.post(`${BASE_URL}/me/pushDevices`, payload)
  },
  async removePushDevice(deviceId: string): Promise<void> {
    await http.delete(`${BASE_URL}/me/pushDevices/${deviceId}`)
  },
  async getPushDevices(): Promise<Array<{ id: string; deviceType: string; subscriptionEndpoint: string }>> {
    const res = await http.get(`${BASE_URL}/me/pushDevices`)
    return res.data
  },
  async delete(id: string): Promise<void> {
    await http.delete(`${BASE_URL}/me/notifications/${id}`)
  }
}
