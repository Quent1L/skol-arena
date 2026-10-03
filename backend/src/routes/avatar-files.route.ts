import type { Context } from "hono";
import { Hono } from "hono";
import { avatarService } from "../services/avatar.service";
import { NotFoundError } from "../types/errors";

/**
 * Avatar images, at /api/avatars/<userId>/<version>/<size>.webp.
 *
 * Mounted outside version negotiation (an <img> cannot send accept-version, and an
 * image URL must not change with the API version) and ahead of the session
 * middleware: a page full of avatars should not cost one session lookup per image.
 *
 * No authentication: the version in the URL is a random v4 uuid, handed out only by
 * the lookup endpoint, and replaced on every upload.
 */
const avatarFiles = new Hono();

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const FILE = /^(\d+)\.webp$/;

/**
 * A URL never changes content, so it can be cached for long. Not `immutable` and not
 * a year, though: after 30 days the browser revalidates, and a version that has been
 * replaced or removed answers 404 and drops out of its cache instead of lingering.
 * A current one costs a 304 and no download.
 */
const CACHE_CONTROL = "public, max-age=2592000";

function notFound(c: Context) {
  c.header("Cache-Control", "no-store");
  return c.text("Not found", 404);
}

/** The image must never be read as anything else, nor embed anything. */
function setSafetyHeaders(c: Context) {
  c.header("X-Content-Type-Options", "nosniff");
  c.header("Content-Security-Policy", "default-src 'none'; sandbox");
  c.header("Content-Disposition", "inline");
  c.header("Cross-Origin-Resource-Policy", "same-site");
}

avatarFiles.get("/:userId/:version/:file", async (c) => {
  const { userId, version, file } = c.req.param();
  const size = Number(FILE.exec(file)?.[1]);
  if (!UUID.test(userId) || !UUID.test(version) || !avatarService.isSize(size)) {
    return notFound(c);
  }

  // Revalidation must still check the version is current: answering 304 on the
  // ETag alone would keep a removed avatar alive in the browser forever.
  if (!(await avatarService.isCurrentVersion(userId, version))) return notFound(c);

  const etag = `"${version}-${size}"`;
  c.header("Cache-Control", CACHE_CONTROL);
  c.header("ETag", etag);
  if (c.req.header("If-None-Match") === etag) return c.body(null, 304);

  try {
    const blob = await avatarService.getVariant(userId, version, size);
    setSafetyHeaders(c);
    c.header("Content-Type", "image/webp");
    c.header("Content-Length", String(blob.size));
    return c.body(blob.data as Uint8Array<ArrayBuffer>, 200);
  } catch (err) {
    if (err instanceof NotFoundError) return notFound(c);
    throw err;
  }
});

export default avatarFiles;
