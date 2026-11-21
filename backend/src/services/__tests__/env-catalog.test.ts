import { describe, it, expect } from "bun:test";
import { describeEnvironment, ENV_CATALOG } from "../../config/env-catalog";

const DOC_PATH = new URL("../../../../docs/src/pages/docs/environment-variables.md", import.meta.url);

/** Every variable named in the first column of a table of the docs page. */
async function documentedVariables(): Promise<string[]> {
  const markdown = await Bun.file(DOC_PATH).text();
  return [...markdown.matchAll(/^\| `([A-Z][A-Z0-9_<>]*)`/gm)].map((match) => match[1]!);
}

describe("env catalog", () => {
  it("lists exactly the variables the documentation lists", async () => {
    const documented = await documentedVariables();
    expect(ENV_CATALOG.map((entry) => entry.name).sort()).toEqual([...documented].sort());
  });

  it("never returns the value of a secret", () => {
    const names = describeEnvironment({ OIDC_PROVIDERS: "authentik" }).map((variable) => variable.name);
    const env = Object.fromEntries(names.map((name) => [name, `value-of-${name}`]));
    for (const variable of describeEnvironment({ ...env, OIDC_PROVIDERS: "authentik" })) {
      if (variable.name === "OIDC_PROVIDERS") continue;
      expect(variable.configured).toBe(true);
      expect(variable.value).toBe(variable.secret ? null : `value-of-${variable.name}`);
    }
  });

  it("treats an empty value as not configured", () => {
    const smtp = describeEnvironment({ SMTP_HOST: "" }).find((v) => v.name === "SMTP_HOST")!;
    expect(smtp).toMatchObject({ configured: false, value: null });
  });

  it("unfolds the OIDC_<ID>_ templates once per listed provider", () => {
    const env = { OIDC_PROVIDERS: "authentik, corp-sso", OIDC_CORP_SSO_CLIENT_SECRET: "s3cret" };
    const oidc = describeEnvironment(env).filter((v) => v.name.startsWith("OIDC_") && v.name !== "OIDC_PROVIDERS");
    expect(oidc.map((v) => v.name)).toContain("OIDC_AUTHENTIK_ISSUER");
    expect(oidc.find((v) => v.name === "OIDC_CORP_SSO_CLIENT_SECRET")).toMatchObject({ configured: true, value: null });
    expect(oidc).toHaveLength(10);
  });

  it("shows no provider variable while OIDC_PROVIDERS is empty", () => {
    expect(describeEnvironment({}).some((v) => v.name.includes("<ID>"))).toBe(false);
  });

  it("never exposes a variable outside the catalog", () => {
    const names = describeEnvironment({ SOME_TOKEN: "x" }).map((v) => v.name);
    expect(names).not.toContain("SOME_TOKEN");
  });
});
