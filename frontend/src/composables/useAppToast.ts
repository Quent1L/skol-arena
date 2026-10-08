import { useToast } from '@nuxt/ui/composables'
import { useViewport } from '@/composables/useViewport'

export type ToastSeverity = 'success' | 'info' | 'warn' | 'error' | 'secondary' | 'contrast'

/** App-level toast message, kept independent from the UI library rendering it. */
export interface AppToastMessage {
  severity?: ToastSeverity
  summary?: string
  detail?: string
  /** Display duration in ms; omitted means the library default. */
  life?: number
}

export interface AppToast {
  add(message: AppToastMessage): void
}

const COLORS = {
  success: 'success',
  info: 'info',
  warn: 'warning',
  error: 'error',
  secondary: 'neutral',
  contrast: 'neutral',
} as const

const ICONS: Record<ToastSeverity, string> = {
  success: 'i-fa7-solid:circle-check',
  info: 'i-fa7-solid:circle-info',
  warn: 'i-fa7-solid:triangle-exclamation',
  error: 'i-fa7-solid:circle-xmark',
  secondary: 'i-fa7-solid:circle-info',
  contrast: 'i-fa7-solid:circle-info',
}

export function useAppToast(): AppToast {
  const toast = useToast()
  const { isMobile } = useViewport()

  return {
    add({ severity = 'info', summary, detail, life }: AppToastMessage) {
      // Small screens only get errors: success/info toasts would cover the content.
      if (isMobile.value && severity !== 'error') return
      toast.add({
        title: summary,
        description: detail,
        color: COLORS[severity],
        icon: ICONS[severity],
        duration: life,
      })
    },
  }
}
