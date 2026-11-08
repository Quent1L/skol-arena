import { describe, it, expect } from "bun:test";

import { ConflictError, ErrorCode } from "../../types/errors";
import { extractPostgresError, handleDatabaseError } from "../db-errors";

const pg = (fields: Record<string, unknown>) => ({ code: "23505", ...fields });

describe("extractPostgresError", () => {
  it("returns null for non-objects", () => {
    expect(extractPostgresError(null)).toBeNull();
    expect(extractPostgresError("boom")).toBeNull();
    expect(extractPostgresError(undefined)).toBeNull();
  });

  it("reads node-postgres style properties directly", () => {
    expect(extractPostgresError(pg({ constraint: "c", detail: "d", message: "m" }))).toEqual({
      code: "23505",
      constraint: "c",
      detail: "d",
      message: "m",
    });
  });

  it.each(["cause", "originalError", "error"])("unwraps a pg error nested under %s", (key) => {
    const wrapped = { message: "wrapper", [key]: pg({ constraint: "nested" }) };
    expect(extractPostgresError(wrapped)?.constraint).toBe("nested");
  });

  it("returns null when no layer carries a string code", () => {
    expect(extractPostgresError({ cause: { code: 42 }, message: "x" })).toBeNull();
    expect(extractPostgresError({})).toBeNull();
  });
});

describe("handleDatabaseError", () => {
  const context = { operation: "create", name: "Cup" };

  it("maps a unique violation on a name column to TOURNAMENT_NAME_ALREADY_EXISTS", () => {
    try {
      handleDatabaseError(pg({ constraint: "tournaments_name_key" }), context);
      throw new Error("should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(ConflictError);
      expect((error as ConflictError).message).toContain(ErrorCode.TOURNAMENT_NAME_ALREADY_EXISTS);
    }
  });

  it("detects the name constraint from the detail text as well", () => {
    expect(() => handleDatabaseError(pg({ detail: 'Key (name)=(Cup) already exists.' }), context)).toThrow(
      ConflictError,
    );
  });

  it("maps a foreign key violation to RESOURCE_IN_USE", () => {
    try {
      handleDatabaseError({ code: "23503", constraint: "fk_x" }, context);
      throw new Error("should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(ConflictError);
      expect((error as ConflictError).message).toContain(ErrorCode.RESOURCE_IN_USE);
    }
  });

  it("rethrows a unique violation that is not about a name", () => {
    const original = pg({ constraint: "slug_key", detail: "Key (slug)", message: "dup" });
    expect(() => handleDatabaseError(original, context)).toThrow(original as unknown as Error);
  });

  it("rethrows unknown errors untouched", () => {
    const original = new Error("connection reset");
    expect(() => handleDatabaseError(original, context)).toThrow(original);
  });
});
