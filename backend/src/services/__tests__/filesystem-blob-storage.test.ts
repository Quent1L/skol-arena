import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FilesystemBlobStorage } from "../../storage/filesystem-blob-storage";
import { assertSafeKey } from "../../storage/blob-storage";

const bytes = (s: string) => new TextEncoder().encode(s);

describe("assertSafeKey", () => {
  it("accepts slash-separated lowercase keys", () => {
    expect(() => assertSafeKey("avatars/0190a1b2-c3d4/abc123/64.webp")).not.toThrow();
  });

  it.each([
    "../x",
    "a/../../b",
    "/etc/passwd",
    "a//b",
    "a/./b",
    "a\\b",
    "",
    "A/B",
    "a/b/",
    "a/b\0.webp",
  ])("refuses %p", (key) => {
    expect(() => assertSafeKey(key)).toThrow();
  });
});

describe("FilesystemBlobStorage", () => {
  let root: string;
  let storage: FilesystemBlobStorage;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "skol-blobs-"));
    storage = new FilesystemBlobStorage(root);
    await storage.init();
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it("round-trips an object and derives its type from the extension", async () => {
    await storage.put("avatars/u1/h1/64.webp", bytes("pixels"), "image/webp");

    const blob = await storage.get("avatars/u1/h1/64.webp");
    expect(blob?.contentType).toBe("image/webp");
    expect(new TextDecoder().decode(blob!.data)).toBe("pixels");
    expect(blob?.size).toBe(6);
  });

  it("answers null for a missing object", async () => {
    expect(await storage.get("avatars/nobody/h/64.webp")).toBeNull();
  });

  it("leaves no temp file behind and overwrites in place", async () => {
    await storage.put("avatars/u1/h1/64.webp", bytes("one"), "image/webp");
    await storage.put("avatars/u1/h1/64.webp", bytes("two"), "image/webp");

    expect(await readdir(join(root, "avatars/u1/h1"))).toEqual(["64.webp"]);
    const blob = await storage.get("avatars/u1/h1/64.webp");
    expect(new TextDecoder().decode(blob!.data)).toBe("two");
  });

  it("deletes a whole prefix and nothing else", async () => {
    await storage.put("avatars/u1/old/64.webp", bytes("a"), "image/webp");
    await storage.put("avatars/u1/old/128.webp", bytes("b"), "image/webp");
    await storage.put("avatars/u1/new/64.webp", bytes("c"), "image/webp");

    await storage.deletePrefix("avatars/u1/old/");

    expect(await storage.get("avatars/u1/old/64.webp")).toBeNull();
    expect(await storage.get("avatars/u1/new/64.webp")).not.toBeNull();
  });

  it("refuses keys that would escape its root", async () => {
    await expect(storage.put("../escape.webp", bytes("x"), "image/webp")).rejects.toThrow();
    await expect(storage.get("avatars/../../etc/passwd")).rejects.toThrow();
    await expect(storage.deletePrefix("../")).rejects.toThrow();
  });
});
