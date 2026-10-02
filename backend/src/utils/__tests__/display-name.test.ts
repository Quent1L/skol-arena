import { describe, it, expect } from "bun:test";
import { toSafeDisplayName } from "../display-name";

describe("toSafeDisplayName", () => {
  it("keeps a valid name", () => {
    expect(toSafeDisplayName("Jean-Pierre Dupont")).toBe("Jean-Pierre Dupont");
  });

  it("drops markup", () => {
    const name = toSafeDisplayName('<img src=x onerror="alert(1)">');
    expect(name).not.toMatch(/[<>"=]/);
  });

  it("uses the local part of an email", () => {
    expect(toSafeDisplayName("john.doe@example.com")).toBe("john doe");
  });

  it("generates a name when nothing usable is left", () => {
    expect(toSafeDisplayName("<>")).toMatch(/^Player-[0-9a-f]{6}$/);
  });
});
