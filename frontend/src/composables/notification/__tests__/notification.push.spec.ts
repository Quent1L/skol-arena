import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const registerPushDevice = vi.fn()
const getPushDevices = vi.fn()
const removePushDevice = vi.fn()
const getConfig = vi.fn()
vi.mock('../notification.api', () => ({
  notificationApi: {
    registerPushDevice: (...a: unknown[]) => registerPushDevice(...a),
    getPushDevices: (...a: unknown[]) => getPushDevices(...a),
    removePushDevice: (...a: unknown[]) => removePushDevice(...a),
  },
}))
vi.mock('../../config.api', () => ({
  configApi: { getConfig: (...a: unknown[]) => getConfig(...a) },
}))
vi.mock('@/i18n', () => ({ i18n: { global: { locale: { value: 'fr' } } } }))

import { useNotificationPush } from '../notification.push'

const subscription = {
  endpoint: 'https://push.example/abc',
  toJSON: () => ({ endpoint: 'https://push.example/abc', keys: { auth: 'a', p256dh: 'p' } }),
  unsubscribe: vi.fn(async () => true),
}
const pushManager = {
  subscribe: vi.fn(async () => subscription),
  getSubscription: vi.fn(async (): Promise<typeof subscription | null> => subscription),
}
const registration = { pushManager }

function stubBrowser(options: { permission?: string; registered?: boolean } = {}) {
  vi.stubGlobal('Notification', {
    requestPermission: vi.fn(async () => options.permission ?? 'granted'),
  })
  Object.defineProperty(navigator, 'serviceWorker', {
    configurable: true,
    value: {
      ready: Promise.resolve(registration),
      getRegistration: vi.fn(async () => (options.registered === false ? undefined : registration)),
    },
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
  getConfig.mockResolvedValue({ vapidPublicKey: 'vapid-key' })
  getPushDevices.mockResolvedValue([{ id: 'dev-1', subscriptionEndpoint: subscription.endpoint }])
  pushManager.getSubscription.mockResolvedValue(subscription)
  stubBrowser()
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('enablePush', () => {
  it('subscribes the browser and registers the device with its locale and timezone', async () => {
    expect(await useNotificationPush().enablePush()).toBe(true)

    expect(pushManager.subscribe).toHaveBeenCalledWith({
      userVisibleOnly: true,
      applicationServerKey: 'vapid-key',
    })
    expect(registerPushDevice).toHaveBeenCalledWith({
      deviceType: 'WEB',
      subscriptionEndpoint: subscription.endpoint,
      subscriptionData: subscription.toJSON(),
      locale: 'fr',
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    })
  })

  it('does nothing when the browser lacks Notification or service workers', async () => {
    vi.stubGlobal('Notification', undefined)
    delete (window as { Notification?: unknown }).Notification
    expect(await useNotificationPush().enablePush()).toBe(false)
    expect(registerPushDevice).not.toHaveBeenCalled()
  })

  it('stops when the user does not grant permission', async () => {
    stubBrowser({ permission: 'denied' })
    expect(await useNotificationPush().enablePush()).toBe(false)
    expect(getConfig).not.toHaveBeenCalled()
  })

  it('stops when the server has no VAPID key', async () => {
    getConfig.mockResolvedValue({})
    expect(await useNotificationPush().enablePush()).toBe(false)
    expect(pushManager.subscribe).not.toHaveBeenCalled()
  })

  it('reports false when anything throws', async () => {
    registerPushDevice.mockRejectedValue(new Error('backend down'))
    expect(await useNotificationPush().enablePush()).toBe(false)
    getConfig.mockRejectedValue('weird')
    expect(await useNotificationPush().enablePush()).toBe(false)
  })
})

describe('disablePush', () => {
  it('removes the device on the server and unsubscribes the browser', async () => {
    expect(await useNotificationPush().disablePush()).toBe(true)
    expect(removePushDevice).toHaveBeenCalledWith('dev-1')
    expect(subscription.unsubscribe).toHaveBeenCalled()
  })

  it('still unsubscribes when the server does not know the device', async () => {
    getPushDevices.mockResolvedValue([])
    expect(await useNotificationPush().disablePush()).toBe(true)
    expect(removePushDevice).not.toHaveBeenCalled()
    expect(subscription.unsubscribe).toHaveBeenCalled()
  })

  it('succeeds quietly when there is no subscription', async () => {
    pushManager.getSubscription.mockResolvedValue(null)
    expect(await useNotificationPush().disablePush()).toBe(true)
    expect(getPushDevices).not.toHaveBeenCalled()
  })

  it('reports false without a service worker registration or support', async () => {
    stubBrowser({ registered: false })
    expect(await useNotificationPush().disablePush()).toBe(false)

    delete (navigator as { serviceWorker?: unknown }).serviceWorker
    expect(await useNotificationPush().disablePush()).toBe(false)
  })

  it('reports false when the server call fails', async () => {
    getPushDevices.mockRejectedValue(new Error('offline'))
    expect(await useNotificationPush().disablePush()).toBe(false)
  })
})
