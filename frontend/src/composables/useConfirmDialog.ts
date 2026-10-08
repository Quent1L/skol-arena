import { useOverlay } from '@nuxt/ui/composables'
import ConfirmModal, { type ConfirmModalProps } from '@/components/ui/ConfirmModal.vue'

/**
 * Promise-based confirmation modal: resolves to true when the user confirms,
 * false when they cancel or dismiss it. Must be called during setup.
 */
export function useConfirmDialog() {
  const modal = useOverlay().create(ConfirmModal, { destroyOnClose: true })

  return async (options: ConfirmModalProps): Promise<boolean> => {
    const confirmed = await modal.open(options).result
    return confirmed === true
  }
}
