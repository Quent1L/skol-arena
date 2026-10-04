import type { CollectionEntry } from 'astro:content'
import { getCollection } from 'astro:content'
import { SITE } from './site'

/**
 * `x.y.z[-tag.n]`. release-it writes no suffix, but the first releases were
 * `1.0.0-beta.n`, and a prerelease sorts below its plain version.
 */
function parse(version: string): number[] {
  const [core, pre] = version.split('-')
  const numbers = core.split('.').map((part) => Number.parseInt(part, 10) || 0)
  const preNumber = pre ? Number.parseInt(pre.split('.').pop() ?? '', 10) || 0 : Infinity
  return [...numbers, preNumber]
}

function compareSemver(a: string, b: string): number {
  const [left, right] = [parse(a), parse(b)]
  for (let i = 0; i < 4; i += 1) {
    if (left[i] !== right[i]) return left[i] - right[i]
  }
  return 0
}

/**
 * Functional release notes, newest version first. Sorted by version rather than by
 * date: two releases cut the same day must still come out in order.
 */
export async function getReleases(): Promise<CollectionEntry<'changelog'>[]> {
  const releases = await getCollection('changelog')
  return releases.sort((a, b) => compareSemver(b.data.version, a.data.version))
}

/** Anchor of a version on /changelog — what the app and the GitHub release link to. */
export function releaseAnchor(version: string): string {
  return `v${version}`
}

/**
 * The technical notes of a version on GitHub. Tags carry no `v` prefix (`tagName` in
 * .release-it.json). Versions released before GitHub releases were switched on have a
 * tag but no release: the same URL then lands on the tag, which still lists the commit.
 */
export function githubReleaseUrl(version: string): string {
  return `${SITE.repo}/releases/tag/${version}`
}
