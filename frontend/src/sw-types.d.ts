/// <reference lib="webworker" />

declare const self: ServiceWorkerGlobalScope &
  typeof globalThis & {
    __WB_MANIFEST: Array<{
      url: string
      revision: string | null
    }>
  }

export {}
