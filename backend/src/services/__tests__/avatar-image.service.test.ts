import { describe, it, expect, afterEach } from "bun:test";
import { avatarImageService, sniffImageFormat, withPipelineSlot } from "../avatar-image.service";
import { formatUploadLimit } from "../../config/avatar";
import { AppError } from "../../types/errors";
import {
  makeJpeg,
  makePng,
  makePngHeaderOnly,
  makeWebp,
  PNG_SIGNATURE,
} from "./helpers/image-fixtures";

const text = (s: string) => new TextEncoder().encode(s);

async function rejection(bytes: Uint8Array): Promise<{ status: number; code: string }> {
  try {
    await avatarImageService.process(bytes);
  } catch (err) {
    expect(err).toBeInstanceOf(AppError);
    const appErr = err as AppError;
    return { status: appErr.statusCode, code: appErr.code };
  }
  throw new Error("expected the upload to be rejected");
}

/** Inserts an APP1 segment right after the JPEG SOI marker. */
function withApp1(jpeg: Uint8Array, payload: string): Uint8Array {
  const body = text(`Exif\0\0${payload}`);
  const segment = new Uint8Array(4 + body.length);
  segment.set([0xff, 0xe1, (body.length + 2) >> 8, (body.length + 2) & 0xff]);
  segment.set(body, 4);
  const out = new Uint8Array(jpeg.length + segment.length);
  out.set(jpeg.subarray(0, 2));
  out.set(segment, 2);
  out.set(jpeg.subarray(2), 2 + segment.length);
  return out;
}

describe("sniffImageFormat", () => {
  it("recognises the three accepted formats from their bytes", async () => {
    expect(sniffImageFormat(makePng(40, 40))).toBe("png");
    expect(sniffImageFormat(await makeJpeg(40, 40))).toBe("jpeg");
    expect(sniffImageFormat(await makeWebp(40, 40))).toBe("webp");
  });

  it("refuses everything else, whatever it claims to be", () => {
    expect(sniffImageFormat(new Uint8Array(0))).toBeNull();
    expect(sniffImageFormat(text("GIF89a......"))).toBeNull();
    expect(sniffImageFormat(text("BM......"))).toBeNull();
    expect(sniffImageFormat(text("<?php system($_GET['c']); ?>"))).toBeNull();
    expect(sniffImageFormat(text("<svg xmlns='http://www.w3.org/2000/svg'/>"))).toBeNull();
    expect(sniffImageFormat(text("RIFF\0\0\0\0WAVEfmt "))).toBeNull();
  });
});

describe("avatarImageService.process", () => {
  afterEach(() => {
    delete process.env.AVATAR_MAX_UPLOAD_BYTES;
  });

  it("renders a WebP variant per size, bounded by that size", async () => {
    const variants = await avatarImageService.process(makePng(1500, 1000));

    expect([...variants.keys()]).toEqual([64, 128, 256, 512, 1024]);
    for (const [size, bytes] of variants) {
      const meta = await new Bun.Image(bytes).metadata();
      expect(meta.format).toBe("webp");
      expect(Math.max(meta.width, meta.height)).toBe(size);
    }
  });

  it("accepts JPEG and WebP input", async () => {
    for (const input of [await makeJpeg(300, 300), await makeWebp(300, 300)]) {
      const variants = await avatarImageService.process(input);
      expect((await new Bun.Image(variants.get(256)!).metadata()).format).toBe("webp");
    }
  });

  it("never upscales a small picture", async () => {
    const variants = await avatarImageService.process(makePng(100, 100));
    expect((await new Bun.Image(variants.get(256)!).metadata()).width).toBe(100);
    expect((await new Bun.Image(variants.get(1024)!).metadata()).width).toBe(100);
  });

  it("drops metadata and anything appended to the image", async () => {
    const jpeg = withApp1(await makeJpeg(200, 200), "GPSLatitude=48.8566");
    const polyglot = new Uint8Array([...jpeg, ...text("<script>alert(1)</script>")]);

    const variants = await avatarImageService.process(polyglot);

    for (const bytes of variants.values()) {
      const decoded = Buffer.from(bytes).toString("latin1");
      expect(decoded).not.toContain("<script>");
      expect(decoded).not.toContain("GPSLatitude");
      expect(decoded).not.toContain("Exif");
    }
  });

  it("refuses a non-image, whatever its name or declared type", async () => {
    expect(await rejection(new Uint8Array(0))).toEqual({ status: 415, code: "AVATAR_UNSUPPORTED_FORMAT" });
    expect(await rejection(text("<?php echo 1; ?>"))).toEqual({ status: 415, code: "AVATAR_UNSUPPORTED_FORMAT" });
    expect(await rejection(text("GIF89a\x01\0\x01\0"))).toEqual({ status: 415, code: "AVATAR_UNSUPPORTED_FORMAT" });
  });

  it("refuses a valid signature followed by garbage", async () => {
    const forged = new Uint8Array([...PNG_SIGNATURE, ...text("not really a png at all")]);
    expect((await rejection(forged)).status).toBe(400);
  });

  it("refuses a header announcing a gigantic canvas before decoding it", async () => {
    expect(await rejection(makePngHeaderOnly(30_000, 30_000))).toEqual({
      status: 400,
      code: "AVATAR_INVALID_DIMENSIONS",
    });
  });

  it("refuses a picture too small to be an avatar", async () => {
    expect(await rejection(makePng(16, 16))).toEqual({
      status: 400,
      code: "AVATAR_INVALID_DIMENSIONS",
    });
  });

  it("refuses an upload over the configured size", async () => {
    process.env.AVATAR_MAX_UPLOAD_BYTES = "100";
    expect(await rejection(makePng(200, 200))).toEqual({ status: 413, code: "AVATAR_TOO_LARGE" });
  });
});

describe("formatUploadLimit", () => {
  it("never rounds a limit up, nor down to zero", () => {
    expect(formatUploadLimit(5 * 1024 * 1024)).toBe("5 MB");
    expect(formatUploadLimit(1.5 * 1024 * 1024 + 1)).toBe("1.5 MB");
    expect(formatUploadLimit(500_000)).toBe("488 KB");
    expect(formatUploadLimit(100)).toBe("100 B");
  });
});

describe("withPipelineSlot", () => {
  it("hands a freed slot to the waiter before any newcomer can take it", async () => {
    let active = 0;
    let peak = 0;
    const releases: Array<() => void> = [];
    const task = () =>
      new Promise<void>((resolve) => {
        active++;
        peak = Math.max(peak, active);
        releases.push(() => {
          active--;
          resolve();
        });
      });

    const runs = [withPipelineSlot(task), withPipelineSlot(task), withPipelineSlot(task)];
    // The first task ends, and a newcomer arrives in the very next microtask, between
    // the slot being freed and the waiter resuming.
    releases[0]!();
    queueMicrotask(() => runs.push(withPipelineSlot(task)));
    await Bun.sleep(0);

    expect(peak).toBe(2);
    // Drain: every queued task must still get its turn.
    for (let i = 1; i < 4; i++) {
      releases[i]!();
      await Bun.sleep(0);
    }
    await Promise.all(runs);
    expect(peak).toBe(2);
  });
});
