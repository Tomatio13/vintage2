import { describe, expect, it } from "vitest";

import { formatResetCountdown, formatResetTime } from "../src/renderer/lib/timeAgo.js";

// Local-time anchor: 2026-09-26 is a Saturday, 09:00 local.
const now = new Date(2026, 8, 26, 9, 0, 0).getTime();

describe("formatResetTime", () => {
  it("renders resets as YYYY/MM/DD HH:MM in the local timezone", () => {
    expect(formatResetTime(new Date(now + 5 * 3_600_000).toISOString(), now)).toBe(
      "2026/09/26 14:00",
    );
    expect(formatResetTime(new Date(now + 26 * 3_600_000).toISOString(), now)).toBe(
      "2026/09/27 11:00",
    );
    expect(formatResetTime(new Date(now + 3 * 86_400_000).toISOString(), now)).toBe(
      "2026/09/29 09:00",
    );
    expect(formatResetTime(new Date(now + 10 * 86_400_000).toISOString(), now)).toBe(
      "2026/10/06 09:00",
    );
  });

  it("zero-pads single-digit months, days, and time units", () => {
    const earlyMorning = new Date(2027, 0, 5, 7, 5, 0).getTime();
    expect(formatResetTime(new Date(earlyMorning).toISOString(), now)).toBe("2027/01/05 07:05");
  });

  it("returns nothing for past or invalid timestamps", () => {
    expect(formatResetTime(new Date(now - 60_000).toISOString(), now)).toBe("");
    expect(formatResetTime("not-a-date", now)).toBe("");
    expect(formatResetTime(null, now)).toBe("");
  });

  it("keeps the countdown available for tooltip display", () => {
    const resetAt = new Date(now + 4 * 3_600_000 + 57 * 60_000).toISOString();
    expect(formatResetCountdown(resetAt, now)).toBe("Resets in 4h 57m");
  });
});
