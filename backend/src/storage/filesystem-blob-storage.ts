import { mkdir, rename, rm, access, constants } from "node:fs/promises";
import { dirname, extname, resolve, sep } from "node:path";
import { assertSafeKey, assertSafePrefix, type BlobStorage, type StoredBlob } from "./blob-storage";

/**
 * The content type is not stored next to the file, so it is derived from the
 * extension — and only from a known one: anything else is served as opaque bytes.
 */
const CONTENT_TYPES: Record<string, string> = {
  ".webp": "image/webp",
  ".png": "image/png",
  ".jpg": "image/jpeg",
};

/**
 * Objects are plain files under `root`, one per key. In a container `root` must be
 * a mounted volume, or every redeploy starts from an empty directory.
 */
export class FilesystemBlobStorage implements BlobStorage {
  readonly driver = "filesystem" as const;
  private readonly root: string;

  constructor(root: string) {
    this.root = resolve(root);
  }

  /** Creates the root if needed and fails loudly when it cannot be written to. */
  async init(): Promise<void> {
    await mkdir(this.root, { recursive: true });
    await access(this.root, constants.R_OK | constants.W_OK);
  }

  /** The content type is not persisted: `get` derives it back from the extension. */
  async put(key: string, data: Uint8Array, _contentType: string): Promise<void> {
    const path = this.pathOf(key);
    await mkdir(dirname(path), { recursive: true });
    // Write then rename: a reader never sees a half-written file, and a crash
    // leaves at worst a stray temp file rather than a truncated image.
    const tmp = `${path}.tmp-${crypto.randomUUID()}`;
    try {
      await Bun.write(tmp, data);
      await rename(tmp, path);
    } catch (err) {
      await rm(tmp, { force: true });
      throw err;
    }
  }

  async get(key: string): Promise<StoredBlob | null> {
    const file = Bun.file(this.pathOf(key));
    if (!(await file.exists())) return null;
    const data = await file.bytes();
    const contentType = CONTENT_TYPES[extname(key)] ?? "application/octet-stream";
    return { data, contentType, size: data.byteLength };
  }

  async deleteMany(keys: string[]): Promise<void> {
    const paths = keys.map((key) => this.pathOf(key));
    await Promise.all(paths.map((path) => rm(path, { force: true })));
  }

  async deletePrefix(prefix: string): Promise<void> {
    assertSafePrefix(prefix);
    await rm(this.resolveInside(prefix), { recursive: true, force: true });
  }

  private pathOf(key: string): string {
    assertSafeKey(key);
    return this.resolveInside(key);
  }

  /** Second line behind assertSafeKey: the resolved path must stay under root. */
  private resolveInside(relative: string): string {
    const path = resolve(this.root, relative);
    if (!path.startsWith(this.root + sep)) {
      throw new Error(`Storage path escapes its root: ${JSON.stringify(relative)}`);
    }
    return path;
  }
}
