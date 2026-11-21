import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest'
import { ref } from 'vue'

const add = vi.fn()
const remove = vi.fn()
const authenticated = ref(true)
vi.mock('../notification.service', () => ({ useNotificationService: () => ({ add, remove }) }))
vi.mock('../../useAuth', () => ({ useAuth: () => ({ isAuthenticated: authenticated }) }))

class FakeSocket {
  static instances: FakeSocket[] = []
  static CONNECTING = 0
  static OPEN = 1
  static CLOSING = 2
  static CLOSED = 3
  readyState = FakeSocket.CONNECTING
  sent: string[] = []
  closed = false
  onopen: (() => void) | null = null
  onmessage: ((evt: { data: string }) => void) | null = null
  onerror: ((err: unknown) => void) | null = null
  onclose: ((evt: { code: number; reason: string }) => void) | null = null
  /** What a browser does: the socket is CLOSED by the time its close event fires. */
  drop(code = 1006, reason = '') {
    this.readyState = FakeSocket.CLOSED
    this.onclose?.({ code, reason })
  }
  constructor(public url: string) {
    FakeSocket.instances.push(this)
  }
  send(data: string) {
    this.sent.push(data)
  }
  close() {
    this.closed = true
  }
  open() {
    this.readyState = FakeSocket.OPEN
    this.onopen?.()
  }
  receive(payload: unknown) {
    this.onmessage?.({ data: typeof payload === 'string' ? payload : JSON.stringify(payload) })
  }
}

/** The module keeps its socket and registries at module level: reload it for each test. */
async function load() {
  vi.resetModules()
  return await import('../notification.socket')
}

// The first import transforms the module graph, which takes seconds under a full parallel
// run: paid here, with real timers and a long timeout, rather than inside a 5s test whose
// late connect() would then leak a socket into the next one.
beforeAll(() => import('../notification.socket'), 30_000)

beforeEach(() => {
  FakeSocket.instances = []
  authenticated.value = true
  vi.clearAllMocks()
  vi.stubGlobal('WebSocket', FakeSocket)
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('notification socket — connecting', () => {
  it('does not connect without a session', async () => {
    authenticated.value = false
    const { useNotificationSocket } = await load()
    useNotificationSocket().connect()
    expect(FakeSocket.instances).toHaveLength(0)
  })

  it('opens one socket, and ignores connect while it is open or connecting', async () => {
    const { useNotificationSocket } = await load()
    const { connect } = useNotificationSocket()
    connect()
    connect()
    expect(FakeSocket.instances).toHaveLength(1)
    expect(FakeSocket.instances[0]!.url).toMatch(/\/api\/ws$/)
    FakeSocket.instances[0]!.open()
    connect()
    expect(FakeSocket.instances).toHaveLength(1)
  })

  it('replaces a socket that is closing or closed', async () => {
    const { useNotificationSocket } = await load()
    const { connect } = useNotificationSocket()
    connect()
    const first = FakeSocket.instances[0]!
    first.readyState = FakeSocket.CLOSED
    connect()
    expect(first.closed).toBe(true)
    expect(FakeSocket.instances).toHaveLength(2)
  })

  it('tells the open handlers, until they unsubscribe', async () => {
    const { useNotificationSocket, onWsOpen } = await load()
    const handler = vi.fn()
    const off = onWsOpen(handler)
    useNotificationSocket().connect()
    FakeSocket.instances[0]!.open()
    expect(handler).toHaveBeenCalledTimes(1)
    off()
    FakeSocket.instances[0]!.open()
    expect(handler).toHaveBeenCalledTimes(1)
  })
})

describe('notification socket — messages', () => {
  it('adds a new notification, reviving its dates', async () => {
    const { useNotificationSocket } = await load()
    useNotificationSocket().connect()
    FakeSocket.instances[0]!.receive({
      event: 'new_notification',
      data: { id: 'n1', createdAt: '2026-02-01T10:00:00.000Z' },
    })
    expect(add).toHaveBeenCalledTimes(1)
    expect(add.mock.calls[0]![0].createdAt).toBeInstanceOf(Date)
  })

  it('removes a deleted notification', async () => {
    const { useNotificationSocket } = await load()
    useNotificationSocket().connect()
    FakeSocket.instances[0]!.receive({ event: 'notification_deleted', data: { id: 'n9' } })
    expect(remove).toHaveBeenCalledWith('n9')
  })

  it('dispatches any event to its registered handlers, until they unsubscribe', async () => {
    const { useNotificationSocket, onWsEvent } = await load()
    const handler = vi.fn()
    const off = onWsEvent('team_created', handler)
    useNotificationSocket().connect()
    FakeSocket.instances[0]!.receive({ event: 'team_created', data: { id: 't' } })
    expect(handler).toHaveBeenCalledWith({ id: 't' })
    off()
    FakeSocket.instances[0]!.receive({ event: 'team_created', data: { id: 't2' } })
    expect(handler).toHaveBeenCalledTimes(1)
  })

  it('survives a malformed message and a socket error', async () => {
    const { useNotificationSocket } = await load()
    useNotificationSocket().connect()
    const socket = FakeSocket.instances[0]!
    socket.receive('{not json')
    socket.onerror?.(new Error('boom'))
    expect(add).not.toHaveBeenCalled()
    expect(console.error).toHaveBeenCalled()
  })
})

describe('notification socket — sending and reconnecting', () => {
  it('only sends while the socket is open', async () => {
    const { useNotificationSocket, sendWsMessage } = await load()
    sendWsMessage({ event: 'early' })
    useNotificationSocket().connect()
    const socket = FakeSocket.instances[0]!
    sendWsMessage({ event: 'connecting' })
    socket.open()
    sendWsMessage({ event: 'subscribe' })
    expect(socket.sent).toEqual([JSON.stringify({ event: 'subscribe' })])
  })

  it('reconnects after two seconds when the connection drops while logged in', async () => {
    const { useNotificationSocket } = await load()
    const { connect, hadUnexpectedDisconnect } = useNotificationSocket()
    connect()
    FakeSocket.instances[0]!.drop(1006, 'lost')
    expect(hadUnexpectedDisconnect.value).toBe(true)
    expect(FakeSocket.instances).toHaveLength(1)
    await vi.advanceTimersByTimeAsync(2000)
    expect(FakeSocket.instances).toHaveLength(2)
  })

  it('does not reconnect once logged out, and a disconnect cancels a pending retry', async () => {
    const { useNotificationSocket } = await load()
    const { connect, disconnect } = useNotificationSocket()
    connect()
    authenticated.value = false
    FakeSocket.instances[0]!.drop(1000, '')
    await vi.advanceTimersByTimeAsync(5000)
    expect(FakeSocket.instances).toHaveLength(1)

    authenticated.value = true
    connect()
    FakeSocket.instances[1]!.drop(1006, '')
    disconnect()
    await vi.advanceTimersByTimeAsync(5000)
    expect(FakeSocket.instances).toHaveLength(2)
  })

  it('closes the socket on disconnect', async () => {
    const { useNotificationSocket } = await load()
    const { connect, disconnect } = useNotificationSocket()
    connect()
    disconnect()
    expect(FakeSocket.instances[0]!.closed).toBe(true)
  })
})
