import { describe, it, expect } from "bun:test";

import { generateVersionSpec } from "../openapi";
import { API_VERSIONS } from "../versions";
import { VERSION_MOUNTS, withOverrides } from "../registry";

type Operation = { parameters?: { name: string }[] };
type Spec = {
  openapi: string;
  servers?: { url: string }[];
  paths: Record<string, Record<string, Operation>>;
};

const OPERATION_KEYS = ["get", "put", "post", "delete", "options", "head", "patch", "trace"];

const operationsOf = (spec: Spec): Operation[] =>
  Object.values(spec.paths).flatMap((pathItem) =>
    Object.entries(pathItem)
      .filter(([key]) => OPERATION_KEYS.includes(key))
      .map(([, operation]) => operation),
  );

describe("OpenAPI specs", () => {
  it.each([...API_VERSIONS])("generates a spec for %s", async (version) => {
    // Also the regression guard for Zod 4 JSON Schema conversion: several shared
    // schemas use .transform() and z.coerce.date(), which z.toJSONSchema refuses
    // outright. If the conversion options ever stop being applied, this throws.
    const spec = (await generateVersionSpec(version)) as Spec;

    expect(spec.openapi).toStartWith("3.1");
    expect(Object.keys(spec.paths).length).toBeGreaterThan(0);
  });

  it("advertises the public prefix as the server, not the internal mount", async () => {
    const spec = (await generateVersionSpec("v1")) as Spec;

    expect(spec.servers).toEqual([{ url: "/api" }]);
    expect(Object.keys(spec.paths).every((path) => !path.startsWith("/__api"))).toBe(true);
  });

  it("documents the negotiation header on every operation", async () => {
    const spec = (await generateVersionSpec("v1")) as Spec;

    const operations = operationsOf(spec);
    expect(operations.length).toBeGreaterThan(0);
    for (const operation of operations) {
      expect(operation.parameters?.some((p) => p.name === "accept-version")).toBe(true);
    }
  });

  it("covers every mounted router", async () => {
    const spec = (await generateVersionSpec("v1")) as Spec;
    const paths = Object.keys(spec.paths);

    for (const { path } of VERSION_MOUNTS.v1) {
      if (path === "/") continue; // mounted at the root, its own paths carry the prefix
      expect(paths.some((documented) => documented.startsWith(path))).toBe(true);
    }
  });
});

describe("withOverrides", () => {
  it("swaps only the router it names and shares the rest by reference", () => {
    const base = VERSION_MOUNTS.v1;
    const replacement = base[0]!.router;
    const next = withOverrides(base, { "/config": replacement });

    expect(next.find((m) => m.path === "/config")!.router).toBe(replacement);
    expect(next.find((m) => m.path === "/matches")!.router).toBe(base.find((m) => m.path === "/matches")!.router);
  });

  it("refuses to override a path nothing is mounted on", () => {
    expect(() => withOverrides(VERSION_MOUNTS.v1, { "/nope": VERSION_MOUNTS.v1[0]!.router })).toThrow(
      /no router is mounted/,
    );
  });
});
