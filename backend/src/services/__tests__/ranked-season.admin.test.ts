/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, mock, beforeEach } from "bun:test";

const seasonRepo = {
  insertTier: mock(async (..._a: any[]): Promise<any> => ({ level: 1 })),
  updateTier: mock(async (..._a: any[]): Promise<any> => ({ level: 1 })),
  deleteTier: mock(async (..._a: any[]): Promise<any> => ({ deleted: true })),
  getConfigByTournamentId: mock(async (..._a: any[]): Promise<any> => ({ baseMmr: 1000 })),
  getRankTiers: mock(async (..._a: any[]): Promise<any[]> => []),
  getSeasonWithConfig: mock(async (..._a: any[]): Promise<any> => ({
    id: "s1",
    status: "ongoing",
    startDate: "2026-01-01",
    endDate: "2026-03-15",
    organizationId: null,
    disciplineId: null,
  })),
  listSeasons: mock(async (..._a: any[]): Promise<any[]> => []),
  getFinishedSeasons: mock(async (..._a: any[]): Promise<any[]> => []),
  countStartedSeasons: mock(async (..._a: any[]): Promise<number> => 2),
};
mock.module("../../repository/ranked-season.repository", () => ({ rankedSeasonRepository: seasonRepo }));

const automationRepo = {
  upsert: mock(async (..._a: any[]): Promise<any> => ({ enabled: true, mode: "close", durationDays: 30 })),
  getByTournamentId: mock(async (..._a: any[]): Promise<any> => undefined),
  scheduleRollover: mock(async (..._a: any[]) => {}),
  setNextSeasonNumber: mock(async (..._a: any[]) => {}),
  delete: mock(async (..._a: any[]) => {}),
};
mock.module("../../repository/ranked-season-automation.repository", () => ({
  rankedSeasonAutomationRepository: automationRepo,
}));

const userRepo = { getById: mock(async (..._a: any[]): Promise<any> => ({ id: "u1", role: "super_admin" })) };
mock.module("../../repository/user.repository", () => ({ userRepository: userRepo }));

const visibleOrganizationIdsFor = mock(async (..._a: any[]): Promise<string[] | null> => ["org1"]);
mock.module("../visibility", () => ({
  visibleOrganizationIdsFor,
  isOrganizationVisible: () => true,
}));

const { rankedSeasonService: service } = await import("../ranked-season.service");

const allMocks = [
  ...Object.values(seasonRepo),
  ...Object.values(automationRepo),
  userRepo.getById,
  visibleOrganizationIdsFor,
];

beforeEach(() => {
  for (const fn of allMocks) fn.mockClear();
  userRepo.getById.mockImplementation(async () => ({ id: "u1", role: "super_admin" }));
  seasonRepo.getSeasonWithConfig.mockImplementation(async () => ({
    id: "s1",
    status: "ongoing",
    startDate: "2026-01-01",
    endDate: "2026-03-15",
    organizationId: null,
    disciplineId: null,
  }));
  automationRepo.getByTournamentId.mockImplementation(async () => undefined);
  seasonRepo.getConfigByTournamentId.mockImplementation(async () => ({ baseMmr: 1000 }));
  seasonRepo.updateTier.mockImplementation(async () => ({ level: 1 }));
});

describe("assertCanManage", () => {
  it("lets a super admin through", async () => {
    await expect(service.assertCanManage("u1")).resolves.toBeUndefined();
  });

  it("refuses an unknown user", async () => {
    userRepo.getById.mockImplementation(async () => undefined);
    await expect(service.assertCanManage("ghost")).rejects.toMatchObject({ message: "FORBIDDEN" });
  });

  it("refuses anyone below super admin", async () => {
    userRepo.getById.mockImplementation(async () => ({ id: "u2", role: "tournament_admin" }));
    await expect(service.assertCanManage("u2")).rejects.toMatchObject({
      message: "INSUFFICIENT_PERMISSIONS",
    });
  });
});

describe("tier administration", () => {
  it("creates, updates and deletes a tier for a manager", async () => {
    expect<unknown>(await service.createTier("s1", { level: 1 } as any, "u1")).toEqual({ level: 1 });
    expect(seasonRepo.insertTier).toHaveBeenCalledWith("s1", { level: 1 });

    expect<unknown>(await service.updateTier("s1", 1, { name: "x" } as any, "u1")).toEqual({ level: 1 });
    expect(seasonRepo.updateTier).toHaveBeenCalledWith("s1", 1, { name: "x" });

    expect<unknown>(await service.deleteTier("s1", 1, "u1")).toEqual({ deleted: true });
    expect(seasonRepo.deleteTier).toHaveBeenCalledWith("s1", 1);
  });

  it("changes nothing when the caller may not manage seasons", async () => {
    userRepo.getById.mockImplementation(async () => ({ id: "u2", role: "player" }));

    await expect(service.createTier("s1", {} as any, "u2")).rejects.toBeDefined();
    await expect(service.updateTier("s1", 1, {} as any, "u2")).rejects.toBeDefined();
    await expect(service.deleteTier("s1", 1, "u2")).rejects.toBeDefined();
    await expect(service.recalculateTiers("s1", "u2")).rejects.toBeDefined();

    expect(seasonRepo.insertTier).not.toHaveBeenCalled();
    expect(seasonRepo.updateTier).not.toHaveBeenCalled();
    expect(seasonRepo.deleteTier).not.toHaveBeenCalled();
  });

  it("reports an unknown tier level", async () => {
    seasonRepo.updateTier.mockImplementation(async () => undefined);

    await expect(service.updateTier("s1", 9, {} as any, "u1")).rejects.toMatchObject({
      message: "RANK_TIER_NOT_FOUND",
    });
  });

  it("recalculates the ladder of a season with a config, and returns it", async () => {
    seasonRepo.getRankTiers.mockImplementation(async () => []);

    expect(await service.recalculateTiers("s1", "u1")).toEqual([]);
    expect(seasonRepo.getConfigByTournamentId).toHaveBeenCalledWith("s1");
  });

  it("refuses to recalculate a season without a ranked config", async () => {
    seasonRepo.getConfigByTournamentId.mockImplementation(async () => undefined);

    await expect(service.recalculateTiers("s1", "u1")).rejects.toMatchObject({
      message: "SEASON_NOT_FOUND",
    });
  });
});

describe("reading seasons", () => {
  it("returns a season's details or throws when it is unknown", async () => {
    expect((await service.getSeasonDetails("s1")).id).toBe("s1");

    seasonRepo.getSeasonWithConfig.mockImplementation(async () => undefined);
    await expect(service.getSeasonDetails("nope")).rejects.toMatchObject({ message: "SEASON_NOT_FOUND" });
  });

  it("lists only what the viewer may see", async () => {
    await service.listSeasons({ disciplineId: "d1", viewerId: "u1" });

    expect(visibleOrganizationIdsFor).toHaveBeenCalledWith("u1");
    expect(seasonRepo.listSeasons).toHaveBeenCalledWith({
      disciplineId: "d1",
      viewerId: "u1",
      visibleOrganizationIds: ["org1"],
    });
  });

  it("lists as an anonymous viewer when no filter is given", async () => {
    await service.listSeasons();

    expect(visibleOrganizationIdsFor).toHaveBeenCalledWith(null);
  });

  it("filters finished seasons by the viewer's organizations", async () => {
    await service.getFinishedSeasons("u1");

    expect(seasonRepo.getFinishedSeasons).toHaveBeenCalledWith(["org1"]);
  });
});

describe("automation", () => {
  it("numbers the next season by counting those already started", async () => {
    expect(await service.nextSeasonNumber({ status: "ongoing", organizationId: null, disciplineId: null })).toBe(3);
    expect(await service.nextSeasonNumber({ status: "draft", organizationId: null, disciplineId: null })).toBe(4);
  });

  it("caches the next season number for the admin form", async () => {
    expect(await service.refreshNextSeasonNumber("s1")).toBe(3);
    expect(automationRepo.setNextSeasonNumber).toHaveBeenCalledWith("s1", 3);
  });

  it("schedules a running season's rollover when the automation is switched on", async () => {
    const out = await service.setAutomation("s1", { enabled: true, mode: "close", durationDays: 30 } as any, "u1");

    expect(automationRepo.upsert).toHaveBeenCalled();
    const [, at] = automationRepo.scheduleRollover.mock.calls[0];
    expect(at).toBeInstanceOf(Date);
    expect(at.getTime()).toBeGreaterThanOrEqual(Date.UTC(2026, 2, 16) - 1);
    expect(automationRepo.setNextSeasonNumber).toHaveBeenCalled();
    expect(out).toMatchObject({ enabled: true });
  });

  it("only stores a disabled automation, and never moves a draft's rollover", async () => {
    await service.setAutomation("s1", { enabled: false, mode: "close", durationDays: 30 } as any, "u1");
    expect(automationRepo.scheduleRollover).not.toHaveBeenCalled();
    expect(automationRepo.setNextSeasonNumber).not.toHaveBeenCalled();

    seasonRepo.getSeasonWithConfig.mockImplementation(async () => ({
      id: "s1", status: "draft", startDate: "2026-01-01", endDate: "2026-03-15", organizationId: null, disciplineId: null,
    }));
    await service.setAutomation("s1", { enabled: true, mode: "close", durationDays: 30 } as any, "u1");
    expect(automationRepo.scheduleRollover).not.toHaveBeenCalled();
    expect(automationRepo.setNextSeasonNumber).toHaveBeenCalled();
  });

  it("returns the stored row after saving when one exists", async () => {
    automationRepo.getByTournamentId.mockImplementation(async () => ({ enabled: false, stored: true }));

    const out = await service.setAutomation("s1", { enabled: false } as any, "u1");

    expect<unknown>(out).toEqual({ enabled: false, stored: true });
  });

  it("deletes an existing automation and refuses to delete a missing one", async () => {
    automationRepo.getByTournamentId.mockImplementation(async () => ({ enabled: true }));
    await service.deleteAutomation("s1", "u1");
    expect(automationRepo.delete).toHaveBeenCalledWith("s1");

    automationRepo.getByTournamentId.mockImplementation(async () => undefined);
    await expect(service.deleteAutomation("s1", "u1")).rejects.toMatchObject({
      message: "SEASON_AUTOMATION_NOT_FOUND",
    });
  });

  it("reads the automation of a season", async () => {
    automationRepo.getByTournamentId.mockImplementation(async () => ({ enabled: true }));
    expect<unknown>(await service.getAutomation("s1")).toEqual({ enabled: true });
  });
});
