import { describe, it, expect } from "bun:test";
import { describeEnvironment, ENV_CATALOG } from "../../config/env-catalog";

const DOC_PATH = new URL("../../../../docs/src/pages/docs/environment-variables.md", import.meta.url);

/** Every variable named in the first column of a table of the docs page. */
async function documentedVariables(): Promise<string[]> {
  const markdown = await Bun.file(DOC_PATH).text();
  return [...markdown.matchAll(/^\| `([A-Z][A-Z0-9_]*)`/gm)].map((match) => match[1]!);
}

describe("env catalog", () => {
  it("lists exactly the variables the documentation lists", async () => {
    const documented = await documentedVariables();
    expect(ENV_CATALOG.map((entry) => entry.name).sort()).toEqual([...documented].sort());
  });

  it("never returns the value of a secret", () => {
    const env = Object.fromEntries(ENV_CATALOG.map((entry) => [entry.name, `value-of-${entry.name}`]));
    for (const variable of describeEnvironment(env)) {
      expect(variable.configured).toBe(true);
      expect(variable.value).toBe(variable.secret ? null : `value-of-${variable.name}`);
    }
  });

  it("treats an empty value as not configured", () => {
    const smtp = describeEnvironment({ SMTP_HOST: "" }).find((v) => v.name === "SMTP_HOST")!;
    expect(smtp).toMatchObject({ configured: false, value: null });
  });

  it("never exposes a variable outside the catalog", () => {
    const names = describeEnvironment({ SOME_TOKEN: "x" }).map((v) => v.name);
    expect(names).not.toContain("SOME_TOKEN");
  });
});
