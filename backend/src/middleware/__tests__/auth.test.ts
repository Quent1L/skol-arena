/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, mock, beforeEach } from "bun:test";
import { Hono } from "hono";

const getSession = mock(async (_opts: unknown): Promise<any> => ({ headers: new Headers(), response: null }));
const getOrCreateAppUser = mock(async (_id: string, _name: string): Promise<string> => "app-1");
const recordActivity = mock(async (_id: string) => {});
const getByExternalId = mock(async (_id: string): Promise<any> => ({ id: "app-9" }));

mock.module("../../config/auth", () => ({ auth: { api: { getSession } } }));
mock.module("../../services/user.service", () => ({ userService: { getOrCreateAppUser, recordActivity } }));
mock.module("../../repository/user.repository", () => ({ userRepository: { getByExternalId } }));

const { requireAuth, resolveOptionalViewer, addUserContext } = await import("../auth");
const { errorHandler } = await import("../error");

const sessionUser = { id: "ba-1", name: "Ann", email: "ann@x.io" };

function build(user: unknown) {
  const app = new Hono();
  app.onError(errorHandler);
  app.use("*", async (c, next) => {
    c.set("user" as never, user as never);
    await next();
  });
  app.get("/p", requireAuth as never, (c) => c.text(String(c.get("appUserId" as never))));
  return app;
}

beforeEach(() => {
  getSession.mockClear();
  getOrCreateAppUser.mockClear();
  getOrCreateAppUser.mockImplementation(async () => "app-1");
  recordActivity.mockClear();
  getByExternalId.mockClear();
});

describe("requireAuth", () => {
  it("answers 401 without a session user", async () => {
    expect((await build(null).request("/p")).status).toBe(401);
  });

  it("resolves the app user id and continues", async () => {
    const res = await build(sessionUser).request("/p");
    expect(await res.text()).toBe("app-1");
    expect(getOrCreateAppUser).toHaveBeenCalledWith("ba-1", "Ann");
  });

  it("names the user by email when the profile has no name", async () => {
    await build({ ...sessionUser, name: "" }).request("/p");
    expect(getOrCreateAppUser).toHaveBeenCalledWith("ba-1", "ann@x.io");
  });

  it("skips the lookup when the version guard already resolved the id", async () => {
    const app = new Hono();
    app.use("*", async (c, next) => {
      c.set("appUserId" as never, "preset" as never);
      await next();
    });
    app.get("/p", requireAuth as never, (c) => c.text(String(c.get("appUserId" as never))));
    expect(await (await app.request("/p")).text()).toBe("preset");
    expect(getOrCreateAppUser).not.toHaveBeenCalled();
  });

  it.each(["USER_DEACTIVATED", "INVITATION_CODE_REQUIRED"])("maps %s to a 403 with its code", async (code) => {
    getOrCreateAppUser.mockImplementationOnce(async () => {
      throw Object.assign(new Error(code), { code });
    });
    const res = await build(sessionUser).request("/p");
    expect(res.status).toBe(403);
    expect(((await res.json()) as any).error.code).toBe(code);
  });

  it("lets any other failure reach the error handler", async () => {
    getOrCreateAppUser.mockImplementationOnce(async () => {
      throw new Error("db down");
    });
    expect((await build(sessionUser).request("/p")).status).toBe(500);
  });
});

describe("resolveOptionalViewer", () => {
  it("is null for an anonymous caller", async () => {
    expect(await resolveOptionalViewer({ get: () => null } as never)).toBeNull();
    expect(getByExternalId).not.toHaveBeenCalled();
  });

  it("returns the app profile id", async () => {
    expect(await resolveOptionalViewer({ get: () => sessionUser } as never)).toBe("app-9");
  });

  it("treats a session without an app profile as anonymous", async () => {
    getByExternalId.mockImplementationOnce(async () => undefined);
    expect(await resolveOptionalViewer({ get: () => sessionUser } as never)).toBeNull();
  });
});

describe("addUserContext", () => {
  const run = async (path = "/x") => {
    const app = new Hono();
    app.use("*", addUserContext);
    app.get("*", (c) => c.json({ user: c.get("user" as never) ?? null }));
    return app.request(path);
  };

  it("sets a null user when there is no session", async () => {
    expect(await (await run()).json()).toEqual({ user: null });
    expect(recordActivity).not.toHaveBeenCalled();
  });

  it("exposes the session user and records the activity", async () => {
    getSession.mockImplementationOnce(async () => ({
      headers: new Headers(),
      response: { user: sessionUser, session: { id: "s" } },
    }));
    expect(((await (await run()).json()) as any).user.id).toBe("ba-1");
    expect(recordActivity).toHaveBeenCalledWith("ba-1");
  });

  it("forwards refreshed session cookies, except on /api/auth routes", async () => {
    const withCookie = () => {
      const headers = new Headers();
      headers.append("set-cookie", "session=fresh; Path=/");
      return { headers, response: { user: sessionUser, session: { id: "s" } } };
    };
    getSession.mockImplementationOnce(async () => withCookie());
    expect((await run("/x")).headers.get("set-cookie")).toContain("session=fresh");

    getSession.mockImplementationOnce(async () => withCookie());
    expect((await run("/api/auth/get-session")).headers.get("set-cookie")).toBeNull();
  });
});
