import { describe, it, expect } from "vitest";
import { DAYS, addDays, dayName, isDateKey, parse, weekStartOf, ymd } from "../src/dates.js";

describe("dates", () => {
  it("round-trips a key through parse and ymd in local time", () => {
    expect(ymd(parse("2026-11-02"))).toBe("2026-11-02");
    expect(ymd(parse("2026-01-05"))).toBe("2026-01-05");
  });

  it("adds days across month and year ends", () => {
    expect(addDays("2026-10-30", 7)).toBe("2026-11-06");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2026-11-02", -3)).toBe("2026-10-30");
  });

  it("weeks start on Friday", () => {
    expect(weekStartOf(parse("2026-10-30"))).toBe("2026-10-30"); // a Friday
    expect(weekStartOf(parse("2026-11-02"))).toBe("2026-10-30"); // Monday after
    expect(weekStartOf(parse("2026-11-05"))).toBe("2026-10-30"); // Thursday, last day
    expect(weekStartOf(parse("2026-11-06"))).toBe("2026-11-06"); // next Friday
  });

  it("names days relative to the Friday start", () => {
    expect(DAYS[0]).toBe("Fri");
    expect(dayName("2026-10-30")).toBe("Fri");
    expect(dayName("2026-11-02")).toBe("Mon");
    expect(dayName("2026-11-05")).toBe("Thu");
  });

  it("recognises date keys only", () => {
    expect(isDateKey("2026-10-30")).toBe(true);
    expect(isDateKey("2026-1-3")).toBe(false);
    expect(isDateKey("week")).toBe(false);
  });
});
