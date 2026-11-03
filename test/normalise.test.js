import { describe, it, expect } from "vitest";
import { normalise } from "../src/state.js";

const meal = (over = {}) => ({ id: "m1", name: "Tacos", ingredients: [], notes: "", ...over });

describe("normalise", () => {
  it("builds the full shape from nothing", () => {
    expect(normalise(null)).toEqual({ meals: [], weeks: {}, aisles: {} });
    expect(normalise({ meals: "nope", weeks: 3, aisles: [] })).toEqual({ meals: [], weeks: {}, aisles: {} });
  });

  it("does not mutate its input", () => {
    const input = { meals: [meal({ ingredients: ["Beef"] })] };
    normalise(input);
    expect(input.meals[0].ingredients).toEqual(["Beef"]);
  });

  it("lowercases and trims ingredients, keeps optional, drops blanks, maybe last", () => {
    const s = normalise({
      meals: [meal({ ingredients: [{ name: " Hummus ", optional: true }, "Beef Mince", { name: "  " }, "Lettuce"] })],
    });
    expect(s.meals[0].ingredients).toEqual([
      { name: "beef mince", optional: false },
      { name: "lettuce", optional: false },
      { name: "hummus", optional: true },
    ]);
    expect(s.meals[0].notes).toBe("");
    expect(normalise({ meals: [meal({ notes: "null" })] }).meals[0].notes).toBe("");
    expect(normalise({ meals: [meal({ notes: null })] }).meals[0].notes).toBe("");
  });

  it("accepts meals stored as a map keyed by id", () => {
    const s = normalise({ meals: { m2: meal({ id: "m2", name: "B" }), m1: meal({ name: "A" }) } });
    expect(s.meals.map((m) => m.id).sort()).toEqual(["m1", "m2"]);
  });

  it("drops aisle overrides pointing at unknown aisles", () => {
    expect(normalise({ aisles: { milk: "dairy", rice: "spaceship" } }).aisles).toEqual({ milk: "dairy" });
  });

  it("repairs week shape and drops junk keys", () => {
    const s = normalise({ weeks: { "2026-10-30": { plan: null }, junk: { plan: { Fri: "m1" } } } });
    expect(s.weeks).toEqual({ "2026-10-30": { plan: {}, checked: {}, extras: [] } });
  });

  it("migrates the v1 single week", () => {
    const s = normalise({
      week: { Mon: "m1" },
      checked: { rice: true },
      extras: [{ id: "x", name: "foil", done: false }],
      weekStart: "2026-10-30",
    });
    expect(s.week).toBeUndefined();
    expect(s.weekStart).toBeUndefined();
    expect(s.weeks["2026-10-30"]).toEqual({
      plan: { Mon: "m1" },
      checked: { rice: true },
      extras: [{ id: "x", name: "foil", done: false }],
    });
  });

  it("re-homes Monday-keyed weeks into Friday weeks", () => {
    // 2026-10-26 is a Monday: Mon-Thu belong to the Friday week of 10-23, Fri-Sun to 10-30
    const s = normalise({
      weeks: {
        "2026-10-26": {
          plan: { Mon: "m1", Thu: "m2", Fri: "m3", Sun: "out" },
          checked: { rice: true },
          extras: [{ id: "x", name: "foil", done: false }],
        },
        "2026-10-30": { plan: { Fri: "m9" }, checked: {}, extras: [] },
      },
    });
    expect(Object.keys(s.weeks).sort()).toEqual(["2026-10-23", "2026-10-30"]);
    expect(s.weeks["2026-10-23"]).toEqual({
      plan: { Mon: "m1", Thu: "m2" },
      checked: { rice: true },
      extras: [{ id: "x", name: "foil", done: false }],
    });
    // an existing pick on the Friday week wins over the migrated one
    expect(s.weeks["2026-10-30"].plan).toEqual({ Fri: "m9", Sun: "out" });
  });

  it("is idempotent", () => {
    const once = normalise({ weeks: { "2026-10-26": { plan: { Mon: "m1" } } }, meals: [meal({ ingredients: ["A"] })] });
    expect(normalise(once)).toEqual(once);
  });
});
