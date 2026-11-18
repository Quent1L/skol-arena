import { useOverlay } from '@nuxt/ui/composables'
import ConfirmModal, { type ConfirmModalProps } from '@/components/ui/ConfirmModal.vue'

/**
 * Promise-based confirmation modal: resolves to true when the user confirms,
 * false when they cancel or dismiss it. Must be called during setup.
 */
export function useConfirmDialog() {
  const overlay = useOverlay()

  return async (options: ConfirmModalProps): Promise<boolean> => {
    // One overlay per call: `destroyOnClose` drops it from the overlay list once closed,
    // so an instance created once at setup would throw "Overlay not found" the second time.
    const modal = overlay.create(ConfirmModal, { destroyOnClose: true })
    const confirmed = await modal.open(options).result
    return confirmed === true
  }
}
