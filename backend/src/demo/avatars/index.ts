/**
 * Avatar pictures shared by the demo data and the docs screenshot seed.
 *
 * DiceBear "Lorelei" illustrations (CC0), named after the showcase player whose
 * seed produced them — see docs/screenshots/README.md. Illustrations rather than
 * photos: nobody's face belongs in a public demo by accident.
 *
 * Imported as files so `bun build` copies them next to the bundle: the Docker
 * image ships `backend/dist` only, and the repository's `docs/` never reaches it.
 */
import anais from "./anais.png" with { type: "file" };
import camille from "./camille.png" with { type: "file" };
import ilyas from "./ilyas.png" with { type: "file" };
import lucas from "./lucas.png" with { type: "file" };
import marta from "./marta.png" with { type: "file" };
import nina from "./nina.png" with { type: "file" };
import theo from "./theo.png" with { type: "file" };

export const AVATAR_FILES = { anais, camille, ilyas, lucas, marta, nina, theo } as const;

export type AvatarName = keyof typeof AVATAR_FILES;

/**
 * Bundled, the import is a path relative to the output file, not to the working
 * directory; unbundled it is absolute. Resolving against import.meta.url covers both.
 */
export async function readAvatar(name: AvatarName): Promise<Uint8Array> {
  return Bun.file(new URL(AVATAR_FILES[name], import.meta.url)).bytes();
}
