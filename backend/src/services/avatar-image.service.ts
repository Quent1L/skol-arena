import { AVATAR_SIZES, type AvatarSize } from "@skol-arena/shared";
import { avatarMaxUploadBytes } from "../config/avatar";
import {
  AppError,
  BadRequestError,
  ErrorCode,
  PayloadTooLargeError,
  UnsupportedMediaTypeError,
} from "../types/errors";
import { logger } from "../utils/logger";

type AcceptedFormat = "jpeg" | "png" | "webp";

/** Smallest side accepted: below this an avatar is just a few blurry pixels. */
export const AVATAR_MIN_SIDE = 32;
/**
 * Pixel budget checked from the header, before any pixel buffer is allocated: a tiny
 * file announcing a gigantic canvas (a decompression bomb) is refused cheaply.
 * 25 MP covers any phone camera.
 */
export const AVATAR_MAX_PIXELS = 25_000_000;
const WEBP_QUALITY = 80;
/** Concurrent decode/encode pipelines. Each holds a full decoded frame in memory. */
const MAX_CONCURRENT_PIPELINES = 2;

/**
 * Identifies the format from the bytes themselves. The client's file name and
 * declared type are never looked at: they are whatever the sender wants them to be.
 */
export function sniffImageFormat(bytes: Uint8Array): AcceptedFormat | null {
  const startsWith = (sig: number[], offset = 0) =>
    bytes.length >= offset + sig.length && sig.every((b, i) => bytes[offset + i] === b);

  if (startsWith([0xff, 0xd8, 0xff])) return "jpeg";
  if (startsWith([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "png";
  // RIFF <size:4> WEBP
  if (startsWith([0x52, 0x49, 0x46, 0x46]) && startsWith([0x57, 0x45, 0x42, 0x50], 8)) {
    return "webp";
  }
  return null;
}

let running = 0;
const waiting: Array<() => void> = [];

/**
 * A finishing pipeline hands its slot straight to the next waiter instead of giving
 * it back: the waiter only resumes a microtask later, and a newcomer must not be able
 * to take the slot in between.
 */
export async function withPipelineSlot<T>(task: () => Promise<T>): Promise<T> {
  if (running < MAX_CONCURRENT_PIPELINES) running++;
  else await new Promise<void>((resolve) => waiting.push(resolve));
  try {
    return await task();
  } finally {
    const next = waiting.shift();
    if (next) next();
    else running--;
  }
}

function imageErrorCode(err: unknown): string | undefined {
  if (typeof err === "object" && err !== null && "code" in err) {
    return String((err as { code: unknown }).code);
  }
  return undefined;
}

/** Bun.Image rejects with its own errors; none of them may leave this module raw. */
function toAppError(err: unknown): Error {
  switch (imageErrorCode(err)) {
    case "ERR_IMAGE_TOO_MANY_PIXELS":
      return new BadRequestError(ErrorCode.AVATAR_INVALID_DIMENSIONS, { min: AVATAR_MIN_SIDE });
    case "ERR_IMAGE_UNKNOWN_FORMAT":
    case "ERR_IMAGE_FORMAT_UNSUPPORTED":
      return new UnsupportedMediaTypeError(ErrorCode.AVATAR_UNSUPPORTED_FORMAT);
    default:
      // Most often a truncated or corrupt file: the sender's fault, hence a 400.
      logger.warn({ err }, "Avatar image could not be processed");
      return new BadRequestError(ErrorCode.AVATAR_PROCESSING_FAILED);
  }
}

function formatSize(bytes: number): string {
  return `${Math.floor(bytes / (1024 * 1024))} MB`;
}

function assertAcceptableInput(bytes: Uint8Array): AcceptedFormat {
  const max = avatarMaxUploadBytes();
  if (bytes.byteLength > max) {
    throw new PayloadTooLargeError(ErrorCode.AVATAR_TOO_LARGE, { max: formatSize(max) });
  }
  const format = sniffImageFormat(bytes);
  if (!format) throw new UnsupportedMediaTypeError(ErrorCode.AVATAR_UNSUPPORTED_FORMAT);
  return format;
}

async function assertDecodable(bytes: Uint8Array, sniffed: AcceptedFormat): Promise<void> {
  const meta = await new Bun.Image(bytes, { maxPixels: AVATAR_MAX_PIXELS }).metadata();
  // A file that sniffs as one format but decodes as another is not one we trust.
  if (meta.format !== sniffed) {
    throw new UnsupportedMediaTypeError(ErrorCode.AVATAR_UNSUPPORTED_FORMAT);
  }
  if (meta.width < AVATAR_MIN_SIDE || meta.height < AVATAR_MIN_SIDE) {
    throw new BadRequestError(ErrorCode.AVATAR_INVALID_DIMENSIONS, { min: AVATAR_MIN_SIDE });
  }
}

const LARGEST_SIZE = Math.max(...AVATAR_SIZES);

/**
 * Fully decodes then re-encodes to WebP, at every size. The uploaded bytes are never
 * kept: whatever rode along in the file (EXIF and GPS data, a script appended after
 * the image data, …) does not survive a decode/encode round trip.
 *
 * The full-size source is decoded once, down to a lossless PNG at the largest size;
 * every variant is then cut from that small intermediate rather than from the source.
 */
async function renderVariants(bytes: Uint8Array): Promise<Map<AvatarSize, Uint8Array>> {
  const base = await new Bun.Image(bytes, { maxPixels: AVATAR_MAX_PIXELS })
    .resize(LARGEST_SIZE, LARGEST_SIZE, { fit: "inside", withoutEnlargement: true })
    .png()
    .bytes();
  const variants = new Map<AvatarSize, Uint8Array>();
  for (const size of AVATAR_SIZES) {
    const out = await new Bun.Image(base)
      .resize(size, size, { fit: "inside", withoutEnlargement: true })
      .webp({ quality: WEBP_QUALITY })
      .bytes();
    variants.set(size, out);
  }
  return variants;
}

export const avatarImageService = {
  async process(bytes: Uint8Array): Promise<Map<AvatarSize, Uint8Array>> {
    const sniffed = assertAcceptableInput(bytes);
    return withPipelineSlot(async () => {
      try {
        await assertDecodable(bytes, sniffed);
        return await renderVariants(bytes);
      } catch (err) {
        if (err instanceof AppError) throw err;
        throw toAppError(err);
      }
    });
  },
};
