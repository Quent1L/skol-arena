import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

// public/boot-recovery.js runs outside the bundle, as a classic script: evaluate its
// source as the browser would, against a stubbed location and service worker API.
const SOURCE = readFileSync(resolve(__dirname, '../../../../public/boot-recovery.js'), 'utf8')

const unregister = vi.fn(() => Promise.resolve(true))
const deleteCache = vi.fn(() => Promise.resolve(true))
let location: { reload: ReturnType<typeof vi.fn> }
let installed: HTMLScriptElement[] = []
let listeners: EventListener[] = []

function boot() {
  const add = vi.spyOn(window, 'addEventListener')
  new Function(SOURCE)()
  listeners.push(...add.mock.calls.map((call) => call[1] as EventListener))
  add.mockRestore()
}

function failScript(type: string) {
  const script = document.createElement('script')
  script.type = type
  document.head.appendChild(script)
  installed.push(script)
  script.dispatchEvent(new Event('error'))
}

function stub(property: string, target: object, value: unknown) {
  Object.defineProperty(target, property, { value, writable: true, configurable: true })
}

/** Lets the unregister/caches promise chain settle. */
const flush = () => new Promise((r) => setTimeout(r, 0))

describe('boot-recovery', () => {
  beforeEach(() => {
    sessionStorage.clear()
    unregister.mockClear()
    deleteCache.mockClear()
    location = { reload: vi.fn() }
    stub('location', window, location)
    stub('onLine', navigator, true)
    stub('serviceWorker', navigator, {
      getRegistrations: () => Promise.resolve([{ unregister }]),
    })
    stub('caches', window, {
      keys: () => Promise.resolve(['workbox-precache-v2']),
      delete: deleteCache,
    })
  })

  afterEach(() => {
    installed.forEach((s) => s.remove())
    installed = []
    listeners.forEach((l) => window.removeEventListener('error', l, true))
    listeners = []
  })

  it('reloads once when the entry module fails to load', () => {
    boot()
    failScript('module')

    expect(location.reload).toHaveBeenCalledOnce()
    expect(unregister).not.toHaveBeenCalled()
  })

  it('drops the service workers and their caches on a second failure', async () => {
    boot()
    failScript('module')
    boot() // the reloaded page
    failScript('module')
    await flush()

    expect(unregister).toHaveBeenCalledOnce()
    expect(deleteCache).toHaveBeenCalledWith('workbox-precache-v2')
    expect(location.reload).toHaveBeenCalledTimes(2)
  })

  it('stops after two attempts instead of looping', async () => {
    for (let i = 0; i < 3; i++) {
      boot()
      failScript('module')
      await flush()
    }

    expect(location.reload).toHaveBeenCalledTimes(2)
  })

  it('starts over once the previous attempts are old', () => {
    sessionStorage.setItem('skol.bootRecovery', JSON.stringify({ attempts: 2, at: Date.now() - 61_000 }))
    boot()
    failScript('module')

    expect(location.reload).toHaveBeenCalledOnce()
  })

  it('ignores classic scripts', () => {
    boot()
    failScript('text/javascript')

    expect(location.reload).not.toHaveBeenCalled()
  })

  it('does nothing offline', () => {
    stub('onLine', navigator, false)
    boot()
    failScript('module')

    expect(location.reload).not.toHaveBeenCalled()
  })
})
