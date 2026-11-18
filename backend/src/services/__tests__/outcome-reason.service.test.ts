/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, mock, beforeEach } from "bun:test";

const reasonRepo = {
  create: mock(async (..._a: any[]): Promise<any> => ({ id: "r1" })),
  getById: mock(async (..._a: any[]): Promise<any> => ({ id: "r1" })),
  list: mock(async (..._a: any[]): Promise<any> => []),
  update: mock(async (..._a: any[]): Promise<any> => ({ id: "r1" })),
  getDeletionBlockers: mock(async (..._a: any[]): Promise<any[]> => []),
  delete: mock(async (..._a: any[]) => {}),
};
mock.module("../../repository/outcome-reason.repository", () => ({ outcomeReasonRepository: reasonRepo }));

const typeRepo = { getById: mock(async (..._a: any[]): Promise<any> => ({ id: "t1" })) };
mock.module("../../repository/outcome-type.repository", () => ({ outcomeTypeRepository: typeRepo }));

const { outcomeReasonService } = await import("../outcome-reason.service");
const { NotFoundError, ConflictError, ErrorCode } = await import("../../types/errors");

beforeEach(() => {
  for (const fn of [...Object.values(reasonRepo), typeRepo.getById]) fn.mockClear();
  reasonRepo.getById.mockImplementation(async () => ({ id: "r1" }));
  reasonRepo.getDeletionBlockers.mockImplementation(async () => []);
  typeRepo.getById.mockImplementation(async () => ({ id: "t1" }));
});

describe("createOutcomeReason", () => {
  it("creates the reason under an existing outcome type", async () => {
    const created = await outcomeReasonService.createOutcomeReason({ outcomeTypeId: "t1", name: "Forfeit" } as any);

    expect<unknown>(created).toEqual({ id: "r1" });
    expect(reasonRepo.create).toHaveBeenCalledWith({ outcomeTypeId: "t1", name: "Forfeit" });
  });

  it("refuses an unknown outcome type", async () => {
    typeRepo.getById.mockImplementation(async () => undefined);

    await expect(
      outcomeReasonService.createOutcomeReason({ outcomeTypeId: "nope", name: "x" } as any),
    ).rejects.toMatchObject({ message: ErrorCode.OUTCOME_TYPE_NOT_FOUND });
    expect(reasonRepo.create).not.toHaveBeenCalled();
  });
});

describe("getOutcomeReasonById", () => {
  it("returns the reason", async () => {
    expect<unknown>(await outcomeReasonService.getOutcomeReasonById("r1")).toEqual({ id: "r1" });
  });

  it("throws NotFoundError for an unknown reason", async () => {
    reasonRepo.getById.mockImplementation(async () => undefined);

    const attempt = outcomeReasonService.getOutcomeReasonById("nope");

    await expect(attempt).rejects.toBeInstanceOf(NotFoundError);
    await expect(attempt).rejects.toMatchObject({ message: ErrorCode.OUTCOME_REASON_NOT_FOUND });
  });
});

describe("listOutcomeReasons", () => {
  it("lists everything without checking a type", async () => {
    await outcomeReasonService.listOutcomeReasons();

    expect(typeRepo.getById).not.toHaveBeenCalled();
    expect(reasonRepo.list).toHaveBeenCalledWith(undefined);
  });

  it("checks the type before filtering on it", async () => {
    await outcomeReasonService.listOutcomeReasons("t1");
    expect(reasonRepo.list).toHaveBeenCalledWith("t1");

    typeRepo.getById.mockImplementation(async () => undefined);
    await expect(outcomeReasonService.listOutcomeReasons("nope")).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe("updateOutcomeReason", () => {
  it("updates an existing reason", async () => {
    await outcomeReasonService.updateOutcomeReason("r1", { name: "New" } as any);

    expect(typeRepo.getById).not.toHaveBeenCalled();
    expect(reasonRepo.update).toHaveBeenCalledWith("r1", { outcomeTypeId: undefined, name: "New" });
  });

  it("checks the new outcome type when the reason moves", async () => {
    typeRepo.getById.mockImplementation(async () => undefined);

    await expect(
      outcomeReasonService.updateOutcomeReason("r1", { outcomeTypeId: "nope" } as any),
    ).rejects.toBeInstanceOf(NotFoundError);
    expect(reasonRepo.update).not.toHaveBeenCalled();
  });

  it("refuses an unknown reason", async () => {
    reasonRepo.getById.mockImplementation(async () => undefined);

    await expect(outcomeReasonService.updateOutcomeReason("nope", {} as any)).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe("deleteOutcomeReason", () => {
  it("deletes an unused reason", async () => {
    const result = await outcomeReasonService.deleteOutcomeReason("r1");

    expect(reasonRepo.delete).toHaveBeenCalledWith("r1");
    expect(result.success).toBe(true);
  });

  it("refuses to delete a reason still in use, naming what blocks it", async () => {
    reasonRepo.getDeletionBlockers.mockImplementation(async () => [{ id: "m1" }]);

    const attempt = outcomeReasonService.deleteOutcomeReason("r1");

    await expect(attempt).rejects.toBeInstanceOf(ConflictError);
    await expect(attempt).rejects.toMatchObject({ message: ErrorCode.OUTCOME_REASON_IN_USE });
    expect(reasonRepo.delete).not.toHaveBeenCalled();
  });
});
