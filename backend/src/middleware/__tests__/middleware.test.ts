import { describe, it, expect, mock, beforeEach } from "bun:test";
import { Hono } from "hono";
import { z } from "zod";

let currentRole: string | undefined = "super_admin";
const assertCanAccess = mock(async (_id: string, _viewer: unknown) => {});

mock.module("../../repository/user.repository", () => ({
  userRepository: { getById: async () => (currentRole ? { role: currentRole } : undefined) },
}));
mock.module("../../services/tournament.service", () => ({
  tournamentService: { assertCanAccess },
}));
mock.module("../auth", () => ({ resolveOptionalViewer: async () => ({ id: "viewer" }) }));

const { errorHandler } = await import("../error");
const { requireSuperAdmin } = await import("../require-role");
const { requireTournamentAccess } = await import("../tournament-access");
const { i18nMiddleware } = await import("../i18n");
const { spaSecurityHeaders } = await import("../security-headers");
const { ForbiddenError, NotFoundError, ErrorCode } = await import("../../types/errors");

function appWith(setup: (app: Hono) => void): Hono {
  const app = new Hono();
  app.onError(errorHandler);
  setup(app);
  return app;
}

describe("errorHandler", () => {
  it("renders an AppError with its status and code", async () => {
    const app = appWith((a) =>
      a.get("/x", () => {
        throw new NotFoundError(ErrorCode.TEAM_NOT_FOUND);
      }),
    );
    const res = await app.request("/x");
    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe(ErrorCode.TEAM_NOT_FOUND);
  });

  it("renders a ZodError as a 400 listing the issues", async () => {
    const app = appWith((a) =>
      a.get("/x", () => {
        const parsed = z.object({ name: z.string() }).safeParse({});
        throw parsed.error;
      }),
    );
    const res = await app.request("/x");
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: { code: string; details: { issues: { path: string }[] } } };
    expect(body.error.code).toBe("VALIDATION_ERROR");
    expect(body.error.details.issues[0].path).toBe("name");
  });

  it("hides the detail of an unknown error behind a generic 500", async () => {
    const app = appWith((a) =>
      a.get("/x", () => {
        throw new Error("secret stack detail");
      }),
    );
    const res = await app.request("/x");
    expect(res.status).toBe(500);
    const text = await res.text();
    expect(text).toContain("UNKNOWN");
    expect(text).not.toContain("secret stack detail");
  });
});

describe("requireSuperAdmin", () => {
  beforeEach(() => {
    currentRole = "super_admin";
  });
  const build = () =>
    appWith((a) => {
      a.use("*", async (c, next) => {
        c.set("appUserId" as never, "u1" as never);
        await next();
      });
      a.get("/admin", requireSuperAdmin, (c) => c.text("ok"));
    });

  it("lets a super admin through", async () => {
    expect((await build().request("/admin")).status).toBe(200);
  });

  it("refuses any other role with a 403", async () => {
    currentRole = "user";
    const res = await build().request("/admin");
    expect(res.status).toBe(403);
    expect(await res.text()).toContain(new ForbiddenError(ErrorCode.INSUFFICIENT_PERMISSIONS).code);
  });

  it("refuses an unknown user", async () => {
    currentRole = undefined;
    expect((await build().request("/admin")).status).toBe(403);
  });
});

describe("requireTournamentAccess", () => {
  const ID = "11111111-1111-4111-8111-111111111111";
  const build = () => appWith((a) => a.get("/t/:id", requireTournamentAccess(), (c) => c.text("ok")));

  beforeEach(() => assertCanAccess.mockClear());

  it("checks access for a competition id", async () => {
    await build().request(`/t/${ID}`);
    expect(assertCanAccess).toHaveBeenCalledTimes(1);
    expect(assertCanAccess.mock.calls[0][0]).toBe(ID);
  });

  it("lets a sibling route segment through without checking", async () => {
    const res = await build().request("/t/finished");
    expect(res.status).toBe(200);
    expect(assertCanAccess).not.toHaveBeenCalled();
  });

  it("propagates a refusal", async () => {
    assertCanAccess.mockImplementationOnce(async () => {
      throw new ForbiddenError(ErrorCode.INSUFFICIENT_PERMISSIONS);
    });
    expect((await build().request(`/t/${ID}`)).status).toBe(403);
  });
});

describe("i18nMiddleware", () => {
  const langOf = async (path: string, headers: Record<string, string> = {}) => {
    const app = new Hono();
    app.use("*", i18nMiddleware);
    app.get("/", (c) => c.text(String(c.get("lang" as never))));
    return (await app.request(path, { headers })).text();
  };

  it("defaults to French", async () => {
    expect(await langOf("/")).toBe("fr");
  });

  it("reads the first Accept-Language tag", async () => {
    expect(await langOf("/", { "Accept-Language": "en-GB,fr;q=0.8" })).toBe("en");
  });

  it("lets the lang query override the header", async () => {
    expect(await langOf("/?lang=fr", { "Accept-Language": "en" })).toBe("fr");
  });

  it("falls back to French for an unsupported language", async () => {
    expect(await langOf("/?lang=xx")).toBe("fr");
  });
});

describe("spaSecurityHeaders", () => {
  it("forbids framing and inline scripts, and leaves HSTS to the proxy", async () => {
    const app = new Hono();
    app.use("*", spaSecurityHeaders);
    app.get("/", (c) => c.text("ok"));
    const res = await app.request("/");
    const csp = res.headers.get("content-security-policy") ?? "";
    expect(csp).toContain("script-src 'self'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(res.headers.get("strict-transport-security")).toBeNull();
  });
});
