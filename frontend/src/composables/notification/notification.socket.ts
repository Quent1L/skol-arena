import { ref } from 'vue'
import { useNotificationService } from './notification.service'
import { useAuth } from '../useAuth'
import { convertStringDatesToJS } from '@/utils/DateUtils'

let socket: WebSocket | null = null
let reconnectTimer: number | null = null

const hadUnexpectedDisconnect = ref(false)
const openHandlers = new Set<() => void>()

type WsEventHandler = (data: unknown) => void
const eventRegistry = new Map<string, Set<WsEventHandler>>()

export function onWsOpen(handler: () => void): () => void {
  openHandlers.add(handler)
  return () => openHandlers.delete(handler)
}

export function onWsEvent(event: string, handler: WsEventHandler): () => void {
  if (!eventRegistry.has(event)) eventRegistry.set(event, new Set())
  eventRegistry.get(event)!.add(handler)
  return () => eventRegistry.get(event)?.delete(handler)
}

export function sendWsMessage(data: unknown): void {
  if (socket?.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify(data))
  }
}

function disconnect() {
  console.log('[WS] Disconnecting')
  if (reconnectTimer) {
    window.clearTimeout(reconnectTimer)
    reconnectTimer = null
  }
  if (socket) {
    socket.close()
    socket = null
  }
}

const WS_BASE = import.meta.env.MODE === 'dev'
  ? 'ws://localhost:3000'
  : window.location.origin.replace('http', 'ws')

export function useNotificationSocket() {
  const { add, remove } = useNotificationService()
  const { isAuthenticated } = useAuth()

  function connect() {
    if (!isAuthenticated.value) {
      console.log('[WS] Not authenticated, skipping connection')
      return
    }

    // Check if already connected or connecting
    if (socket) {
      if (socket.readyState === WebSocket.OPEN) {
        console.log('[WS] Already connected')
        return
      }
      if (socket.readyState === WebSocket.CONNECTING) {
        console.log('[WS] Connection already in progress')
        return
      }
      // If socket exists but is closing/closed, clean it up first
      console.log('[WS] Cleaning up old socket (state:', socket.readyState, ')')
      socket.close()
      socket = null
    }

    console.log('[WS] Connecting to', `${WS_BASE}/api/ws`)
    // No accept-version header here: the browser WebSocket API cannot set request
    // headers, which is exactly why /api/ws is exempt from API version negotiation
    // on the server side.
    socket = new WebSocket(`${WS_BASE}/api/ws`)

    socket.onopen = () => {
      console.log('[WS] Connected successfully')
      openHandlers.forEach((h) => h())
    }

    socket.onmessage = (evt) => {
      console.log('[WS] Message received:', evt.data)
      try {
        const payload = JSON.parse(evt.data)
        if (payload.event === 'new_notification') {
          console.log('[WS] New notification (raw):', payload.data)
          // Convert date strings to Date objects like the HTTP interceptor does
          const notificationWithDates = convertStringDatesToJS(payload.data)
          console.log('[WS] New notification (parsed):', notificationWithDates)
          add(notificationWithDates)
        }
        if (payload.event === 'notification_deleted') {
          console.log('[WS] Notification deleted:', payload.data.id)
          remove(payload.data.id)
        }
        // Dispatch to generic event registry
        const handlers = eventRegistry.get(payload.event)
        handlers?.forEach((h) => h(payload.data))
      } catch (e) {
        console.error('[WS] Parse error', e)
      }
    }

    socket.onerror = (err) => {
      console.error('[WS] Error:', err)
    }

    socket.onclose = (evt) => {
      console.log('[WS] Closed:', evt.code, evt.reason)
      hadUnexpectedDisconnect.value = true
      if (reconnectTimer) window.clearTimeout(reconnectTimer)
      if (isAuthenticated.value) {
        console.log('[WS] Reconnecting in 2s...')
        reconnectTimer = window.setTimeout(connect, 2000)
      }
    }
  }

  return { connect, disconnect, hadUnexpectedDisconnect }
}
