/**
 * Avatar footprint, shared by PlayerAvatar and anything that has to line up with it
 * (the "+N" chip of PlayerAvatarStack). Kept out of the SFCs so the two can never drift.
 */
export type AvatarSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl'

const SIZE_CLASS: Record<AvatarSize, string> = {
  xs: 'w-6 h-6 text-[10px]',
  sm: 'w-7 h-7 text-xs',
  md: 'w-9 h-9 text-sm',
  lg: 'w-16 h-16 text-xl',
  xl: 'w-24 h-24 text-3xl',
}

/** Rendered width in CSS pixels, matching SIZE_CLASS: what `<img sizes>` is told. */
const SIZE_PX: Record<AvatarSize, number> = {
  xs: 24,
  sm: 28,
  md: 36,
  lg: 64,
  xl: 96,
}

export function avatarSizeClass(size?: AvatarSize): string {
  return SIZE_CLASS[size ?? 'md']
}

export function avatarSizePx(size?: AvatarSize): number {
  return SIZE_PX[size ?? 'md']
}
