import { computed, ref, type ComputedRef } from 'vue'
import { changelogUrl } from '@/config/links'
import { compareSemver } from '@/utils/semver'

/**
 * The "What's new" entry of the user menu and its unread badge.
 *
 * The badge tracks release notes, not releases: it lights up when the bundle ships
 * notes newer than the last ones this browser opened. A release without functional
 * notes moves `__APP_VERSION__` but not `__NOTES_VERSION__`, so it stays quiet.
 */

const STORAGE_KEY = 'skol.whatsNew.seenVersion'

export interface WhatsNew {
  hasUnseen: ComputedRef<boolean>
  url: string
  /** Opens the changelog in a new tab and turns the badge off. */
  open: () => void
}

function readSeen(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY)
  } catch {
    // Private mode or a blocked store: every session starts with the badge on.
    return null
  }
}

function persistSeen(version: string): void {
  try {
    localStorage.setItem(STORAGE_KEY, version)
  } catch {
    // Nothing to do: the badge stays off for this session only.
  }
}

// Module-level so the avatar badge and the menu entry agree without a store.
const seen = ref<string | null>(readSeen())

export function useWhatsNew(
  notesVersion: string = __NOTES_VERSION__,
  appVersion: string = __APP_VERSION__,
): WhatsNew {
  const hasUnseen = computed(
    () => notesVersion !== '' && (seen.value === null || compareSemver(seen.value, notesVersion) < 0),
  )
  // Anchored on the notes this bundle knows about, which always have a section on the
  // page — the app's own version may have none.
  const url = changelogUrl(notesVersion || appVersion)

  function open(): void {
    if (notesVersion) {
      seen.value = notesVersion
      persistSeen(notesVersion)
    }
    window.open(url, '_blank', 'noopener')
  }

  return { hasUnseen, url, open }
}

