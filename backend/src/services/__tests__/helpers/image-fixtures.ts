import { deflateSync } from "node:zlib";

/**
 * Real images built in memory, so the avatar tests need no binary fixtures in the
 * repository. A PNG is assembled by hand (it is the one format that is trivial to
 * write); JPEG and WebP are derived from it through Bun.Image.
 */

function chunk(type: string, data: Uint8Array): Uint8Array {
  const typeBytes = new TextEncoder().encode(type);
  const out = new Uint8Array(12 + data.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, data.length);
  out.set(typeBytes, 4);
  out.set(data, 8);
  const crcInput = new Uint8Array(4 + data.length);
  crcInput.set(typeBytes, 0);
  crcInput.set(data, 4);
  view.setUint32(8 + data.length, Bun.hash.crc32(crcInput));
  return out;
}

function concat(parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

export const PNG_SIGNATURE = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function ihdr(width: number, height: number): Uint8Array {
  const data = new Uint8Array(13);
  const view = new DataView(data.buffer);
  view.setUint32(0, width);
  view.setUint32(4, height);
  data[8] = 8; // bit depth
  data[9] = 2; // colour type: RGB
  return chunk("IHDR", data);
}

/** A width×height RGB gradient PNG. */
export function makePng(width: number, height: number): Uint8Array {
  const raw = new Uint8Array(height * (1 + width * 3));
  for (let y = 0; y < height; y++) {
    const row = y * (1 + width * 3);
    for (let x = 0; x < width; x++) {
      raw[row + 1 + x * 3] = (x * 255) / width;
      raw[row + 2 + x * 3] = (y * 255) / height;
      raw[row + 3 + x * 3] = 128;
    }
  }
  return concat([
    PNG_SIGNATURE,
    ihdr(width, height),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", new Uint8Array(0)),
  ]);
}

/**
 * A PNG whose header announces width×height but carries no real pixel data: what a
 * decompression bomb looks like before it is decoded.
 */
export function makePngHeaderOnly(width: number, height: number): Uint8Array {
  return concat([
    PNG_SIGNATURE,
    ihdr(width, height),
    chunk("IDAT", deflateSync(new Uint8Array(16))),
    chunk("IEND", new Uint8Array(0)),
  ]);
}

export async function makeJpeg(width: number, height: number): Promise<Uint8Array> {
  return new Bun.Image(makePng(width, height)).jpeg({ quality: 90 }).bytes();
}

export async function makeWebp(width: number, height: number): Promise<Uint8Array> {
  return new Bun.Image(makePng(width, height)).webp({ quality: 90 }).bytes();
}
