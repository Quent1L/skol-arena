/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, beforeEach, afterEach, mock, spyOn } from "bun:test";

// ─── Mocks ───────────────────────────────────────────────────────────────────

const mockUserRepo = {
  touchLastSeen: mock((_e: any, _s: any) => Promise.resolve()),
};
mock.module("../../repository/user.repository", () => ({ userRepository: mockUserRepo }));

mock.module("../../repository/invitation.repository", () => ({
  invitationRepository: { hasUserUsedCode: mock(() => Promise.resolve(true)) },
}));
mock.module("../organization.service", () => ({ organizationService: {} }));
mock.module("../player-cache.service", () => ({ playerCacheService: {} }));
mock.module("../../config/auth", () => ({ auth: { api: {} } }));

import { UserService } from "../user.service";

// ─── Setup ───────────────────────────────────────────────────────────────────

const THROTTLE_MS = 15 * 60 * 1000;
const START = new Date("2026-08-09T10:00:00Z").getTime();

let service: UserService;
let now: number;
let nowSpy: ReturnType<typeof spyOn>;

// The throttle cache lives at module scope, so every test uses its own user id
// to stay independent from the ones that ran before.
let userCounter = 0;
function nextUserId(): string {
  userCounter += 1;
  return `ext-user-${userCounter}`;
}

beforeEach(() => {
  service = new UserService();
  mockUserRepo.touchLastSeen.mockClear();
  now = START;
  nowSpy = spyOn(Date, "now").mockImplementation(() => now);
});

afterEach(() => {
  nowSpy.mockRestore();
});

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("UserService.recordActivity", () => {
  it("writes on the first request of a user", async () => {
    const userId = nextUserId();

    await service.recordActivity(userId);

    expect(mockUserRepo.touchLastSeen).toHaveBeenCalledTimes(1);
    expect(mockUserRepo.touchLastSeen.mock.calls[0]?.[0]).toBe(userId);
  });

  it("skips the write while inside the throttle window", async () => {
    const userId = nextUserId();

    await service.recordActivity(userId);
    now += THROTTLE_MS - 1000;
    await service.recordActivity(userId);

    expect(mockUserRepo.touchLastSeen).toHaveBeenCalledTimes(1);
  });

  it("writes again once the throttle window elapsed", async () => {
    const userId = nextUserId();

    await service.recordActivity(userId);
    now += THROTTLE_MS + 1;
    await service.recordActivity(userId);

    expect(mockUserRepo.touchLastSeen).toHaveBeenCalledTimes(2);
  });

  it("throttles each user independently", async () => {
    const first = nextUserId();
    const second = nextUserId();

    await service.recordActivity(first);
    await service.recordActivity(second);
    await service.recordActivity(first);

    expect(mockUserRepo.touchLastSeen).toHaveBeenCalledTimes(2);
  });

  it("passes a staleBefore one window in the past, so the SQL guard matches", async () => {
    const userId = nextUserId();

    await service.recordActivity(userId);

    const staleBefore = mockUserRepo.touchLastSeen.mock.calls[0]?.[1] as unknown as Date;
    expect(staleBefore).toBeInstanceOf(Date);
    expect(staleBefore.getTime()).toBe(START - THROTTLE_MS);
  });

  it("propagates repository failures to the caller", async () => {
    const userId = nextUserId();
    mockUserRepo.touchLastSeen.mockImplementationOnce(() => Promise.reject(new Error("db down")));

    await expect(service.recordActivity(userId)).rejects.toThrow("db down");
  });
});
