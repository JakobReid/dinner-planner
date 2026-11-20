import { describe, it, expect } from "vitest";
import { ALL, normalise, planOf, toDoc } from "../src/state.js";

const meal = (over = {}) => ({ id: "m1", name: "Tacos", ingredients: [], notes: "", ...over });
const TIMES = [
  { id: "breakfast", name: "Breakfast", each: true },
  { id: "lunch", name: "Lunch", each: true },
  { id: "dinner", name: "Dinner", each: false },
];

describe("normalise", () => {
  it("builds the full shape from nothing", () => {
    const blank = {
      name: "Home",
      members: {},
      invites: {},
      people: {},
      mealTimes: TIMES,
      meals: [],
      weeks: {},
      aisles: {},
    };
    expect(normalise(null)).toEqual(blank);
    expect(normalise({ meals: "nope", weeks: 3, aisles: [], name: 4, members: [] })).toEqual(blank);
    expect(normalise({ name: "  Lake trip ", members: { u1: true } })).toMatchObject({
      name: "Lake trip",
      members: { u1: true },
    });
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

  it("a list from before meal times keeps its dinners as the shared Dinner, untouched", () => {
    const old = {
      name: "Home",
      members: { u1: true },
      meals: { m1: meal() },
      weeks: { "2026-10-30": { plan: { Fri: "m1", Sun: "out" }, checked: { rice: true }, extras: [] } },
      aisles: {},
    };
    const s = normalise(old);
    expect(s.mealTimes).toEqual(TIMES);
    expect(s.mealTimes.find((t) => t.id === "dinner").each).toBe(false);
    expect(s.weeks).toEqual(old.weeks);
    expect(planOf(s.weeks["2026-10-30"], "dinner", ALL)).toEqual({ Fri: "m1", Sun: "out" });
    // and it goes back to the document as it came: no meal times written, no plans moved
    expect(toDoc(s)).toEqual({ name: "Home", meals: old.meals, weeks: old.weeks, aisles: {} });
  });

  it("reads meal times from the document's map in their saved order, and falls back to the defaults", () => {
    const s = normalise({
      mealTimes: {
        dinner: { name: "Tea", each: false, order: 1 },
        abc1234: { name: "  Morning tea ", each: true, order: 0 },
        "bad id": { name: "Nope", order: 2 },
        noname: { name: "  ", order: 3 },
      },
    });
    expect(s.mealTimes).toEqual([
      { id: "abc1234", name: "Morning tea", each: true },
      { id: "dinner", name: "Tea", each: false },
    ]);
    expect(toDoc(s).mealTimes).toEqual({
      abc1234: { name: "Morning tea", each: true, order: 0 },
      dinner: { name: "Tea", each: false, order: 1 },
    });
    expect(normalise({ mealTimes: {} }).mealTimes).toEqual(TIMES);
    expect(normalise({ mealTimes: "nope" }).mealTimes).toEqual(TIMES);
  });

  it("keeps per-person plans and people's names, dropping anything empty or malformed", () => {
    const s = normalise({
      people: { u1: { name: " Jakob Reid " }, u2: { name: "" }, u3: "nope" },
      weeks: {
        "2026-10-30": {
          plans: {
            lunch: { u1: { Mon: "m1", Nope: "m1", Tue: 4 }, u2: {} },
            breakfast: "x",
            abc: { all: { Fri: "out" } },
          },
        },
        "2026-11-06": { plans: { lunch: { u1: {} } } },
      },
    });
    expect(s.people).toEqual({ u1: { name: "Jakob Reid" } });
    expect(s.weeks["2026-10-30"].plans).toEqual({ lunch: { u1: { Mon: "m1" } }, abc: { all: { Fri: "out" } } });
    expect("plans" in s.weeks["2026-11-06"]).toBe(false);
  });

  it("is idempotent", () => {
    const once = normalise({ weeks: { "2026-10-26": { plan: { Mon: "m1" } } }, meals: [meal({ ingredients: ["A"] })] });
    expect(normalise(once)).toEqual(once);
    const more = normalise({
      mealTimes: { dinner: { name: "Dinner", each: false, order: 0 }, x1: { name: "Snack", each: true, order: 1 } },
      weeks: { "2026-10-30": { plans: { x1: { u1: { Mon: "m1" } } } } },
    });
    expect(normalise(more)).toEqual(more);
  });
});
