import { notificationApi } from './notification.api'
import { configApi } from '../config.api'
import { i18n } from '@/i18n'

async function enablePush() {
  try {
    console.log('[enablePush] Starting...')
    if (!('Notification' in window) || !('serviceWorker' in navigator)) {
      console.log('[enablePush] Notification or ServiceWorker not supported')
      return false
    }

    console.log('[enablePush] Requesting permission...')
    const permission = await Notification.requestPermission()
    console.log('[enablePush] Permission result:', permission)
    if (permission !== 'granted') {
      console.log('[enablePush] Permission denied or dismissed')
      return false
    }

    // Get VAPID public key from backend
    console.log('[enablePush] Fetching VAPID key from backend...')
    const config = await configApi.getConfig()
    console.log('[enablePush] Config received:', config)
    if (!config.vapidPublicKey) {
      console.error('[enablePush] VAPID public key not configured on server')
      return false
    }

    console.log('[enablePush] Waiting for service worker ready...')
    const registration = await navigator.serviceWorker.ready
    console.log('[enablePush] Service worker ready:', registration)

    console.log('[enablePush] Subscribing to push manager...')
    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: config.vapidPublicKey,
    })
    console.log('[enablePush] Subscription created:', subscription)
    console.log('[enablePush] Subscription endpoint:', subscription.endpoint)

    // Convert subscription to JSON object
    const subscriptionJson = subscription.toJSON()
    console.log('[enablePush] Subscription JSON:', subscriptionJson)
    console.log('[enablePush] Has keys:', !!subscriptionJson.keys)

    console.log('[enablePush] Registering device with backend...')
    await notificationApi.registerPushDevice({
      deviceType: 'WEB',
      subscriptionEndpoint: subscription.endpoint,
      subscriptionData: subscriptionJson,
      // Push payloads are rendered server-side while this device is offline
      locale: i18n.global.locale.value,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    })
    console.log('[enablePush] Device registered successfully')

    return true
  } catch (error) {
    console.error('[enablePush] Error occurred:', error)
    console.error(
      '[enablePush] Error message:',
      error instanceof Error ? error.message : 'Unknown error',
    )
    console.error('[enablePush] Error stack:', error instanceof Error ? error.stack : 'No stack')
    return false
  }
}

async function disablePush() {
  console.log('[disablePush] Starting...')
  console.log('[disablePush] Checking service worker support...')
  console.log('[disablePush] navigator.serviceWorker:', 'serviceWorker' in navigator)

  if (!('serviceWorker' in navigator)) {
    console.log('[disablePush] Service worker not supported')
    return false
  }

  try {
    console.log('[disablePush] Waiting for service worker ready...')

    // Check if there's already a registered service worker
    const existingRegistration = await navigator.serviceWorker.getRegistration()
    console.log('[disablePush] Existing registration:', existingRegistration)

    if (!existingRegistration) {
      console.log('[disablePush] No service worker registered yet')
      return false
    }

    const registration = (await Promise.race([
      navigator.serviceWorker.ready,
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Service worker ready timeout')), 5000),
      ),
    ])) as ServiceWorkerRegistration

    console.log('[disablePush] Service worker ready:', registration)

    console.log('[disablePush] Getting current subscription...')
    const subscription = await registration.pushManager.getSubscription()
    console.log('[disablePush] Current subscription:', subscription)

    if (subscription) {
      // Get current devices to find the one to remove
      console.log('[disablePush] Fetching devices from API...')
      const devices = await notificationApi.getPushDevices()
      console.log('[disablePush] Devices:', devices)
      const currentDevice = devices.find((d) => d.subscriptionEndpoint === subscription.endpoint)
      console.log('[disablePush] Current device:', currentDevice)

      if (currentDevice) {
        console.log('[disablePush] Removing device:', currentDevice.id)
        await notificationApi.removePushDevice(currentDevice.id)
        console.log('[disablePush] Device removed from backend')
      }

      // Unsubscribe from push
      console.log('[disablePush] Unsubscribing from push...')
      const unsubscribed = await subscription.unsubscribe()
      console.log('[disablePush] Unsubscribed successfully:', unsubscribed)
    } else {
      console.log('[disablePush] No active subscription found')
    }

    console.log('[disablePush] Completed successfully')
    return true
  } catch (error) {
    console.error('[disablePush] Error occurred:', error)
    console.error('[disablePush] Error stack:', error instanceof Error ? error.stack : 'No stack')
    return false
  }
}

export function useNotificationPush() {
  return { enablePush, disablePush }
}
