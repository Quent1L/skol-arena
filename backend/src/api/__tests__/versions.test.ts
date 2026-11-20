import { describe, it, expect } from "bun:test";

import { API_VERSIONS, LATEST_API_VERSION, normalizeVersion } from "../versions";

describe("normalizeVersion", () => {
  it("accepts the spellings a client is likely to send", () => {
    expect(normalizeVersion("v1")).toBe("v1");
    expect(normalizeVersion("V1")).toBe("v1");
    expect(normalizeVersion("1")).toBe("v1");
    expect(normalizeVersion(" v1 ")).toBe("v1");
  });

  it("refuses anything it does not serve", () => {
    expect(normalizeVersion("v9")).toBeNull();
    expect(normalizeVersion("latest")).toBeNull();
    expect(normalizeVersion("v1.2")).toBeNull();
    expect(normalizeVersion("2")).toBeNull();
  });

  it("treats an explicitly empty header as a client bug, not as 'give me latest'", () => {
    expect(normalizeVersion("")).toBeNull();
    expect(normalizeVersion("   ")).toBeNull();
  });

  it("serves a version it declares as the latest", () => {
    expect(API_VERSIONS).toContain(LATEST_API_VERSION);
  });
});
