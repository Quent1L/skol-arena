import { describe, it, expect } from "bun:test";
import { resolveOidcProviders, oidcEnvPrefix } from "../../config/oidc-providers";

const authentik = {
  OIDC_AUTHENTIK_ISSUER: "https://auth.example/application/o/skol/",
  OIDC_AUTHENTIK_CLIENT_ID: "skol",
  OIDC_AUTHENTIK_CLIENT_SECRET: "s3cret",
};

const legacyKeycloak = {
  KEYCLOAK_ISSUER: "https://sso.example/realms/skol",
  KEYCLOAK_CLIENT_ID: "skol-app",
  KEYCLOAK_CLIENT_SECRET: "kc-secret",
};

describe("resolveOidcProviders", () => {
  it("returns no provider when nothing is configured", () => {
    expect(resolveOidcProviders({})).toEqual({ providers: [], warnings: [] });
  });

  it("reads each listed provider from its prefixed variables", () => {
    const { providers, warnings } = resolveOidcProviders({
      OIDC_PROVIDERS: " authentik , corp-sso",
      ...authentik,
      OIDC_AUTHENTIK_LABEL: "Sign in with Authentik",
      OIDC_CORP_SSO_ISSUER: "https://corp.example",
      OIDC_CORP_SSO_CLIENT_ID: "corp",
      OIDC_CORP_SSO_CLIENT_SECRET: "corp-secret",
      OIDC_CORP_SSO_PKCE: "false",
    });
    expect(warnings).toEqual([]);
    expect(providers).toEqual([
      {
        id: "authentik",
        label: "Sign in with Authentik",
        issuer: "https://auth.example/application/o/skol",
        clientId: "skol",
        clientSecret: "s3cret",
        pkce: true,
        legacy: false,
      },
      {
        id: "corp-sso",
        label: null,
        issuer: "https://corp.example",
        clientId: "corp",
        clientSecret: "corp-secret",
        pkce: false,
        legacy: false,
      },
    ]);
  });

  it("refuses a listed provider with a missing variable", () => {
    expect(() =>
      resolveOidcProviders({ OIDC_PROVIDERS: "authentik", ...authentik, OIDC_AUTHENTIK_CLIENT_SECRET: " " }),
    ).toThrow("OIDC_AUTHENTIK_CLIENT_SECRET");
  });

  it.each(["Authentik", "credential", "-x", "a_b"])("refuses the provider id %p", (id) => {
    expect(() => resolveOidcProviders({ OIDC_PROVIDERS: id })).toThrow("invalid provider id");
  });

  it("refuses a provider listed twice", () => {
    expect(() => resolveOidcProviders({ OIDC_PROVIDERS: "authentik,authentik", ...authentik })).toThrow("listed twice");
  });

  it("maps the legacy KEYCLOAK_* variables onto the keycloak id, with a deprecation warning", () => {
    const { providers, warnings } = resolveOidcProviders({
      ...legacyKeycloak,
      KEYCLOAK_LOGIN_LABEL: "Okteo",
      KEYCLOAK_PKCE: "false",
    });
    expect(providers).toEqual([
      {
        id: "keycloak",
        label: "Okteo",
        issuer: "https://sso.example/realms/skol",
        clientId: "skol-app",
        clientSecret: "kc-secret",
        pkce: true,
        legacy: true,
      },
    ]);
    expect(warnings).toHaveLength(2);
    expect(warnings[0]).toContain("deprecated");
    expect(warnings[1]).toContain("KEYCLOAK_PKCE is ignored");
  });

  it("ignores an incomplete legacy configuration, as before", () => {
    expect(resolveOidcProviders({ KEYCLOAK_ISSUER: "https://sso.example" }).providers).toEqual([]);
  });

  it("lets OIDC_PROVIDERS win over KEYCLOAK_* for the keycloak id", () => {
    const { providers, warnings } = resolveOidcProviders({
      ...legacyKeycloak,
      OIDC_PROVIDERS: "keycloak",
      OIDC_KEYCLOAK_ISSUER: "https://new.example/realms/skol",
      OIDC_KEYCLOAK_CLIENT_ID: "new",
      OIDC_KEYCLOAK_CLIENT_SECRET: "new-secret",
    });
    expect(providers.map((p) => [p.id, p.clientId, p.legacy])).toEqual([["keycloak", "new", false]]);
    expect(warnings[0]).toContain("ignored");
  });

  it("keeps the legacy keycloak next to new providers", () => {
    const { providers } = resolveOidcProviders({ ...legacyKeycloak, OIDC_PROVIDERS: "authentik", ...authentik });
    expect(providers.map((p) => p.id)).toEqual(["authentik", "keycloak"]);
  });
});

describe("oidcEnvPrefix", () => {
  it("upper-cases the id and turns dashes into underscores", () => {
    expect(oidcEnvPrefix("corp-sso")).toBe("OIDC_CORP_SSO_");
  });
});
