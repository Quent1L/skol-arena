import { describe, it, expect } from "bun:test";

import { localizeNotificationParams } from "../../utils/notification-format";

const ISO = "2026-06-01T15:00:00.000Z";

describe("localizeNotificationParams", () => {
  it("formats an ISO instant in the requested timezone", () => {
    expect(localizeNotificationParams({ matchDate: ISO }, "fr", "Europe/Paris").matchDate).toBe("01/06/2026 17:00");
  });

  it("shifts the rendered time with the timezone, not the stored instant", () => {
    expect(localizeNotificationParams({ matchDate: ISO }, "fr", "America/New_York").matchDate).toBe("01/06/2026 11:00");
  });

  it("renders in the requested locale", () => {
    expect(localizeNotificationParams({ matchDate: ISO }, "en", "Europe/Paris").matchDate).toBe("01/06/2026, 17:00");
  });

  it("falls back to fr for an unknown locale", () => {
    expect(localizeNotificationParams({ matchDate: ISO }, "de", "Europe/Paris").matchDate).toBe("01/06/2026 17:00");
  });

  it("resolves a null matchDate to the localized placeholder", () => {
    expect(localizeNotificationParams({ matchDate: null }, "fr").matchDate).toBe("À définir");
    expect(localizeNotificationParams({ matchDate: null }, "en").matchDate).toBe("To be defined");
  });

  it("leaves a legacy pre-formatted date untouched", () => {
    const legacy = { matchDate: "18/07/2026 12:34" };
    expect(localizeNotificationParams(legacy, "fr", "Europe/Paris").matchDate).toBe("18/07/2026 12:34");
  });

  it("does not reinterpret an ambiguous legacy date as MM/DD", () => {
    // new Date("05/06/2026 12:34") parses as May 6th and would silently shift the day
    const legacy = { matchDate: "05/06/2026 12:34" };
    expect(localizeNotificationParams(legacy, "fr", "Europe/Paris").matchDate).toBe("05/06/2026 12:34");
  });

  it("leaves params without a matchDate untouched", () => {
    const params = { scoreA: "5", scoreB: "3" };
    expect(localizeNotificationParams(params, "fr")).toEqual(params);
  });

  it("resolves empty participant lists to localized placeholders", () => {
    const resolved = localizeNotificationParams({ teammates: "", opponents: "", creatorName: null }, "fr");
    expect(resolved.teammates).toBe("Aucun");
    expect(resolved.opponents).toBe("Joueur inconnu");
    expect(resolved.creatorName).toBe("Un joueur");
  });

  it("keeps non-empty participant values", () => {
    const resolved = localizeNotificationParams({ teammates: "Toto", opponents: "Titi", creatorName: "Tata" }, "fr");
    expect(resolved.teammates).toBe("Toto");
    expect(resolved.opponents).toBe("Titi");
    expect(resolved.creatorName).toBe("Tata");
  });

  it("returns an empty object for null params", () => {
    expect(localizeNotificationParams(null, "fr")).toEqual({});
  });
});
