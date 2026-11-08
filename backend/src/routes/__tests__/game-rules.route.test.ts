/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, mock, beforeEach } from "bun:test";
import { Hono } from "hono";

const service = {
  listGameRules: mock(async (): Promise<any> => [{ id: "g1" }]),
  createGameRule: mock(async (data: any): Promise<any> => ({ id: "g2", ...data })),
  getGameRuleById: mock(async (id: string): Promise<any> => ({ id: id })),
  updateGameRule: mock(async (id: string, _by: string, data: any): Promise<any> => ({ id, ...data })),
  deleteGameRule: mock(async (_id: string, _by: string) => {}),
};
mock.module("../../services/game-rules.service", () => ({ gameRulesService: service }));
mock.module("../../middleware/auth", () => ({
  requireAuth: async (c: any, next: () => Promise<void>) => {
    if (!c.req.header("x-user")) return c.json({ error: "Unauthorized" }, 401);
    c.set("appUserId", "user-1");
    await next();
  },
}));

const { default: gameRules } = await import("../game-rules.route");
const { errorHandler } = await import("../../middleware/error");

const app = new Hono();
app.onError(errorHandler);
app.route("/game-rules", gameRules as never);

const authed = { "x-user": "1", "content-type": "application/json" };
const ID = "11111111-1111-4111-8111-111111111111";

beforeEach(() => Object.values(service).forEach((fn) => fn.mockClear()));

describe("game-rules routes", () => {
  it("lists rules for an authenticated caller only", async () => {
    expect((await app.request("/game-rules")).status).toBe(401);
    const res = await app.request("/game-rules", { headers: authed });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([{ id: "g1" }]);
  });

  it("serves a single rule publicly", async () => {
    const res = await app.request(`/game-rules/${ID}`);
    expect(res.status).toBe(200);
    expect(service.getGameRuleById).toHaveBeenCalledWith(ID);
  });

  it("creates a rule stamped with the caller and answers 201", async () => {
    const res = await app.request("/game-rules", {
      method: "POST",
      headers: authed,
      body: JSON.stringify({ title: "Rules", content: "<p>x</p>" }),
    });
    expect(res.status).toBe(201);
    expect(service.createGameRule.mock.calls[0][0]).toMatchObject({ title: "Rules", createdBy: "user-1" });
  });

  it("rejects an invalid body before reaching the service", async () => {
    const res = await app.request("/game-rules", { method: "POST", headers: authed, body: JSON.stringify({}) });
    expect(res.status).toBe(400);
    expect(service.createGameRule).not.toHaveBeenCalled();
  });

  it("updates through the service with the caller's id", async () => {
    const res = await app.request(`/game-rules/${ID}`, {
      method: "PATCH",
      headers: authed,
      body: JSON.stringify({ title: "New" }),
    });
    expect(res.status).toBe(200);
    expect(service.updateGameRule).toHaveBeenCalledWith(ID, "user-1", expect.objectContaining({ title: "New" }));
  });

  it("deletes and confirms", async () => {
    const res = await app.request(`/game-rules/${ID}`, { method: "DELETE", headers: authed });
    expect(await res.json()).toEqual({ success: true });
    expect(service.deleteGameRule).toHaveBeenCalledWith(ID, "user-1");
  });
});
