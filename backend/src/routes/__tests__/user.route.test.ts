/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, mock, beforeEach } from "bun:test";
import { Hono } from "hono";

const userService = {
  getAppUserById: mock(async (..._a: any[]): Promise<any> => ({
    id: "u1",
    externalId: "ext1",
    displayName: "Ann",
    shortName: "AN",
    role: "player",
    avatarVersion: undefined,
    createdAt: new Date("2026-01-01"),
    updatedAt: new Date("2026-01-02"),
  })),
  updateProfile: mock(async (..._a: any[]): Promise<any> => ({
    id: "u1",
    externalId: "ext1",
    displayName: "New",
    shortName: "NW",
    role: "player",
    avatarVersion: 3,
    createdAt: new Date("2026-01-01"),
    updatedAt: new Date("2026-01-02"),
  })),
  getAllUsers: mock(async (..._a: any[]): Promise<any[]> => [
    {
      id: "u2",
      externalId: "ext2",
      displayName: "Bob",
      shortName: "BO",
      role: "player",
      avatarVersion: 1,
      createdAt: new Date("2026-01-01"),
      updatedAt: new Date("2026-01-02"),
      externalUser: { id: "b1", email: "bob@x.io", name: "bob@x.io", image: null, emailVerified: true },
    },
  ]),
  searchUsers: mock(async (..._a: any[]): Promise<any[]> => [{ id: "u2" }]),
};
mock.module("../../services/user.service", () => ({ userService }));

const userRepository = { getById: mock(async (..._a: any[]): Promise<any> => ({ id: "u1", role: "super_admin" })) };
mock.module("../../repository/user.repository", () => ({ userRepository }));

const playerStatsService = {
  getComparison: mock(async (..._a: any[]): Promise<any> => ({ headToHead: null })),
  getPlayerProfile: mock(async (..._a: any[]): Promise<any> => ({ id: "p1" })),
  getPlayerTournaments: mock(async (..._a: any[]): Promise<any[]> => [{ id: "t1" }]),
  getPlayerStats: mock(async (..._a: any[]): Promise<any> => ({ stats: {} })),
};
mock.module("../../services/player-stats.service", () => ({ playerStatsService }));

const rulesService = { getPlayerBadges: mock(async (..._a: any[]): Promise<any[]> => [{ id: "b1" }]) };
mock.module("../../services/rules.service", () => ({ rulesService }));

mock.module("../../middleware/auth", () => ({
  requireAuth: async (c: any, next: () => Promise<void>) => {
    if (!c.req.header("x-user")) return c.json({ error: "Unauthorized" }, 401);
    c.set("appUserId", "u1");
    c.set("user", { id: "ba1", email: "ann@x.io", name: "Ann", image: null, emailVerified: true });
    await next();
  },
  resolveOptionalViewer: async (c: any) => (c.req.header("x-user") ? "u1" : null),
}));

const { default: users } = await import("../user.route");
const { errorHandler } = await import("../../middleware/error");

const app = new Hono();
app.onError(errorHandler);
app.route("/users", users as never);

const authed = { "x-user": "1", "content-type": "application/json" };
const ID = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";

beforeEach(() => {
  for (const fn of [
    ...Object.values(userService),
    ...Object.values(playerStatsService),
    ...Object.values(rulesService),
    userRepository.getById,
  ]) {
    fn.mockClear();
  }
  userRepository.getById.mockImplementation(async () => ({ id: "u1", role: "super_admin" }));
});

describe("GET /users/me", () => {
  it("needs a session", async () => {
    expect((await app.request("/users/me")).status).toBe(401);
  });

  it("returns the app profile with the auth record, avatar version defaulted to null", async () => {
    const res = await app.request("/users/me", { headers: authed });
    const body: any = await res.json();

    expect(res.status).toBe(200);
    expect(body).toMatchObject({ id: "u1", displayName: "Ann", avatarVersion: null });
    expect(body.betterAuth).toMatchObject({ id: "ba1", email: "ann@x.io" });
    expect(userService.getAppUserById).toHaveBeenCalledWith("u1");
  });
});

describe("PATCH /users/me", () => {
  it("updates the caller's own profile", async () => {
    const res = await app.request("/users/me", {
      method: "PATCH",
      headers: authed,
      body: JSON.stringify({ displayName: "Newname", shortName: "nwn" }),
    });

    expect(res.status).toBe(200);
    expect(userService.updateProfile).toHaveBeenCalledWith(
      "u1",
      expect.objectContaining({ displayName: "Newname", shortName: "NWN" }),
    );
    expect(((await res.json()) as any).avatarVersion).toBe(3);
  });

  it("rejects an invalid body before reaching the service", async () => {
    const res = await app.request("/users/me", {
      method: "PATCH",
      headers: authed,
      body: JSON.stringify({ displayName: 42 }),
    });

    expect(res.status).toBe(400);
    expect(userService.updateProfile).not.toHaveBeenCalled();
  });
});

describe("GET /users", () => {
  it("shows a super admin the contact details", async () => {
    const res = await app.request("/users", { headers: authed });
    const [user] = (await res.json()) as any[];

    expect(res.status).toBe(200);
    expect(user.betterAuth.email).toBe("bob@x.io");
    expect(user.betterAuth.name).toBe("bob@x.io");
  });

  it("hides the contact details from a tournament admin", async () => {
    userRepository.getById.mockImplementation(async () => ({ id: "u1", role: "tournament_admin" }));

    const res = await app.request("/users", { headers: authed });
    const [user] = (await res.json()) as any[];

    expect(res.status).toBe(200);
    expect(user.betterAuth.email).toBeUndefined();
    expect(user.betterAuth.name).toBeUndefined();
    expect(user.betterAuth.id).toBe("b1");
  });

  it.each([["player"], [undefined]])("refuses a %s", async (role) => {
    userRepository.getById.mockImplementation(async () => (role ? { id: "u1", role } : undefined));

    const res = await app.request("/users", { headers: authed });

    expect(res.status).toBe(403);
    expect(userService.getAllUsers).not.toHaveBeenCalled();
  });
});

describe("search and compare", () => {
  it("searches players by name", async () => {
    const res = await app.request("/users/search?q=an&limit=5", { headers: authed });

    expect(res.status).toBe(200);
    expect(userService.searchUsers).toHaveBeenCalledWith("an", 5);
    expect((await app.request("/users/search?q=an")).status).toBe(401);
  });

  it("compares two players for the signed-in viewer", async () => {
    const res = await app.request(`/users/compare?playerA=${ID}&playerB=${OTHER}`, { headers: authed });

    expect(res.status).toBe(200);
    expect(playerStatsService.getComparison).toHaveBeenCalledWith(ID, OTHER, expect.any(Object), "u1");
    expect((await app.request(`/users/compare?playerA=${ID}&playerB=${OTHER}`)).status).toBe(401);
  });

  it("is not captured by the :id route", async () => {
    await app.request("/users/search?q=an", { headers: authed });

    expect(playerStatsService.getPlayerProfile).not.toHaveBeenCalled();
  });
});

describe("player pages", () => {
  it("serves a profile", async () => {
    const res = await app.request(`/users/${ID}`, { headers: authed });

    expect(await res.json()).toEqual({ id: "p1" });
    expect(playerStatsService.getPlayerProfile).toHaveBeenCalledWith(ID);
  });

  it("lists the tournaments for the viewer, anonymous or not", async () => {
    const signedIn = await app.request(`/users/${ID}/tournaments`, { headers: authed });
    expect(await signedIn.json()).toEqual({ tournaments: [{ id: "t1" }] });
    expect(playerStatsService.getPlayerTournaments).toHaveBeenLastCalledWith(ID, "u1");

    await app.request(`/users/${ID}/tournaments`);
    expect(playerStatsService.getPlayerTournaments).toHaveBeenLastCalledWith(ID, null);
  });

  it("serves filtered stats under the viewer's visibility", async () => {
    const res = await app.request(`/users/${ID}/stats`, { headers: authed });

    expect(res.status).toBe(200);
    expect(playerStatsService.getPlayerStats).toHaveBeenCalledWith(ID, expect.any(Object), "u1");
  });

  it("serves the badges", async () => {
    const res = await app.request(`/users/${ID}/badges`);

    expect(await res.json()).toEqual({ badges: [{ id: "b1" }] });
    expect(rulesService.getPlayerBadges).toHaveBeenCalledWith(ID, null);
  });
});
