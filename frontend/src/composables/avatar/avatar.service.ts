import { reactive } from 'vue'
import { AVATAR_LOOKUP_MAX_IDS, AVATAR_SIZES, avatarPath, type AvatarSize } from '@skol-arena/shared'
import { apiBaseURL } from '@/config/api-base'

/**
 * Loaded on first use: PlayerAvatar renders on nearly every screen, and keeping the
 * HTTP client out of its static imports keeps it a leaf component.
 */
const api = () => import('./avatar.api').then((m) => m.avatarApi)

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Avatar version per player id, shared by every avatar on screen. `null` means "looked
 * up, has none"; a missing key means "not asked yet". Player references across the
 * API carry no avatar on purpose (see the backend avatar route), so this is filled
 * by batched lookups: every avatar mounted in the same tick costs one request.
 */
const known = reactive(new Map<string, string | null>())
const pending = new Set<string>()
let flushScheduled = false
/** Resolves once every lookup queued so far has been answered. */
let settled: Promise<void> = Promise.resolve()

async function lookupChunk(ids: string[]): Promise<void> {
  try {
    const { avatars } = await (await api()).lookup(ids)
    for (const id of ids) known.set(id, avatars[id] ?? null)
  } catch {
    // An avatar is decoration: on failure the initials stay, and the ids are
    // forgotten so a later render may ask again.
    for (const id of ids) if (known.get(id) === undefined) known.delete(id)
  }
}

async function flush(): Promise<void> {
  flushScheduled = false
  const ids = [...pending]
  pending.clear()
  for (let i = 0; i < ids.length; i += AVATAR_LOOKUP_MAX_IDS) {
    await lookupChunk(ids.slice(i, i + AVATAR_LOOKUP_MAX_IDS))
  }
}

/** Queues a lookup for `id` unless it is already known or on its way. */
function request(id: string): void {
  if (!UUID.test(id) || known.has(id) || pending.has(id)) return
  pending.add(id)
  if (!flushScheduled) {
    flushScheduled = true
    const previous = settled
    settled = new Promise<void>((resolve) => setTimeout(resolve, 0))
      .then(flush)
      .then(() => previous)
  }
}

function avatarUrl(userId: string, version: string, size: AvatarSize): string {
  return `${apiBaseURL}${avatarPath(userId, version, size)}`
}

/** Every stored variant as a `srcset`: the browser picks the one its `sizes` calls for. */
function avatarSrcset(userId: string, version: string): string {
  return AVATAR_SIZES.map((s) => `${avatarUrl(userId, version, s)} ${s}w`).join(', ')
}

/**
 * Avatar state shared across the app.
 */
export function useAvatarService() {
  /** The current version of a player's avatar, null when they have none or it is not known yet. */
  function versionFor(id: string): string | null {
    request(id)
    return known.get(id) ?? null
  }

  /** Records a version learnt elsewhere (own profile, after an upload or a removal). */
  function remember(id: string, version: string | null): void {
    known.set(id, version)
  }

  async function upload(userId: string, image: Blob): Promise<string> {
    const { avatarVersion } = await (await api()).upload(image)
    remember(userId, avatarVersion)
    return avatarVersion
  }

  async function remove(userId: string): Promise<void> {
    await (await api()).remove()
    remember(userId, null)
  }

  async function removeFor(userId: string): Promise<void> {
    await (await api()).removeFor(userId)
    remember(userId, null)
  }

  return { versionFor, remember, avatarUrl, avatarSrcset, upload, remove, removeFor }
}

/** Test hook: waits for every lookup queued so far. */
export function avatarLookupsSettled(): Promise<void> {
  return settled
}

/** Test hook: forgets everything known or queued. */
export function resetAvatarCache(): void {
  known.clear()
  pending.clear()
  flushScheduled = false
}
