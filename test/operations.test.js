import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as S from "../src/state.js";

const { DEL } = S;
const meal = (id, name, ingredients = []) => ({ id, name, ingredients: ingredients.map((n) => S.ing(n)), notes: "" });
let patches;

beforeEach(() => {
  vi.useFakeTimers({ now: new Date(2026, 10, 2, 12) }); // Mon 2 Nov 2026, week of Fri 30 Oct
  patches = [];
  S.setRemote((p) => patches.push(p));
  S.replaceState({ meals: [meal("m1", "Tacos", ["beef mince", "lettuce"]), meal("m2", "Curry", ["rice"])] });
  S.setViewWeek("2026-10-30");
});
afterEach(() => vi.useRealTimers());

const last = () => patches.at(-1);

describe("nights", () => {
  it("plans a night and patches only that field", () => {
    S.setNight("Mon", "m1");
    expect(S.state.weeks["2026-10-30"].plan).toEqual({ Mon: "m1" });
    expect(last()).toEqual({ weeks: { "2026-10-30": { plan: { Mon: "m1" } } } });
  });

  it("clearing the last night drops the week", () => {
    S.setNight("Mon", "m1");
    S.setNight("Mon", null);
    expect(S.state.weeks).toEqual({});
    expect(last()).toEqual({ weeks: { "2026-10-30": DEL } });
  });

  it("clearWeek removes the week", () => {
    S.setNight("Mon", "m1");
    S.clearWeek("2026-10-30");
    expect(last()).toEqual({ weeks: { "2026-10-30": DEL } });
  });

  it("fills only empty nights from today on", () => {
    S.setNight("Fri", "m1");
    const { empty, filled } = S.fillEmptyNights();
    expect(empty).toEqual(["Mon", "Tue", "Wed", "Thu"]);
    expect(filled).toEqual([3, 4, 5, 6]);
    const plan = S.state.weeks["2026-10-30"].plan;
    expect(plan.Fri).toBe("m1");
    expect(plan.Sat).toBeUndefined();
    expect(Object.keys(last().weeks["2026-10-30"].plan).sort()).toEqual(["Mon", "Thu", "Tue", "Wed"]);
  });

  it("lastHad reports the most recent past date per meal", () => {
    S.setNight("Fri", "m1"); // 30 Oct
    S.setNight("Wed", "m1"); // 4 Nov, future
    S.setViewWeek("2026-10-23");
    S.setNight("Sat", "m2"); // 24 Oct
    expect(S.lastHad()).toEqual({ m1: "2026-10-30", m2: "2026-10-24" });
  });
});

describe("meals", () => {
  it("adds a meal under a new id", () => {
    const id = S.upsertMeal(null, { name: "Soup", ingredients: [S.ing("leek")], notes: "" });
    expect(S.mealById(id).name).toBe("Soup");
    expect(last()).toEqual({ meals: { [id]: S.mealById(id) } });
  });

  it("edits a meal in place", () => {
    S.upsertMeal("m1", { name: "Beef tacos", ingredients: [], notes: "n" });
    expect(S.state.meals.map((m) => m.name)).toEqual(["Beef tacos", "Curry"]);
    expect(last().meals.m1.name).toBe("Beef tacos");
  });

  it("deleting a meal unplans it everywhere", () => {
    S.setNight("Fri", "m1");
    S.setNight("Sat", "m2");
    S.setViewWeek("2026-11-06");
    S.setNight("Mon", "m1");
    S.deleteMeal("m1");
    expect(S.mealById("m1")).toBeUndefined();
    expect(S.state.weeks["2026-10-30"].plan).toEqual({ Sat: "m2" });
    expect(S.state.weeks["2026-11-06"]).toBeUndefined();
    expect(last()).toEqual({
      meals: { m1: DEL },
      weeks: { "2026-10-30": { plan: { Fri: DEL } }, "2026-11-06": DEL },
    });
  });
});

describe("shopping", () => {
  it("merges ingredients across meals; optional only when every meal says so", () => {
    S.upsertMeal("m2", { name: "Curry", ingredients: [S.ing("rice"), S.ing("lettuce", true)], notes: "" });
    S.setNight("Fri", "m1");
    S.setNight("Sat", "m2");
    const items = Object.fromEntries(S.shoppingItems().map((i) => [i.key, i]));
    expect(Object.keys(items).sort()).toEqual(["beef mince", "lettuce", "rice"]);
    expect(items.lettuce.optional).toBe(false);
    expect(items.lettuce.meals).toEqual(["Tacos", "Curry"]);
  });

  it("ticks are per week and clear with DEL", () => {
    S.setNight("Fri", "m1");
    S.tick("lettuce", true);
    expect(last()).toEqual({ weeks: { "2026-10-30": { checked: { lettuce: true } } } });
    S.tick("lettuce", false);
    expect(last()).toEqual({ weeks: { "2026-10-30": { checked: { lettuce: DEL } } } });
  });

  it("extras are written whole and untick resets them", () => {
    S.addExtra("foil");
    const [x] = S.wk().extras;
    S.setExtraDone(x, true);
    expect(last()).toEqual({ weeks: { "2026-10-30": { extras: [{ id: x.id, name: "foil", done: true }] } } });
    S.tick("rice", true);
    S.untickAll();
    expect(S.wk().checked).toEqual({});
    expect(last()).toEqual({
      weeks: { "2026-10-30": { checked: DEL, extras: [{ id: x.id, name: "foil", done: false }] } },
    });
    S.removeExtra(x);
    expect(last()).toEqual({ weeks: { "2026-10-30": DEL } });
  });

  it("aisle overrides win over guesses", () => {
    expect(S.aisleOf("rice")).toBe("pantry");
    S.setAisle("rice", "frozen");
    expect(S.aisleOf("rice")).toBe("frozen");
    expect(last()).toEqual({ aisles: { rice: "frozen" } });
  });
});

describe("toDoc", () => {
  it("keys meals by id for the document and leaves members out", () => {
    const d = S.toDoc(S.state);
    expect(d.meals).toEqual({ m1: S.mealById("m1"), m2: S.mealById("m2") });
    expect(d.name).toBe("Home");
    expect("members" in d).toBe(false);
  });

  it("setName trims, caps and patches", () => {
    S.setName("  Lake trip  ");
    expect(S.state.name).toBe("Lake trip");
    expect(last()).toEqual({ name: "Lake trip" });
    S.setName("   ");
    expect(S.state.name).toBe("Home");
  });
});

describe("matchMeals", () => {
  it("lists everything sorted by name with no query", () => {
    expect(S.matchMeals("").map((r) => r.m.name)).toEqual(["Curry", "Tacos"]);
  });

  it("matches names, then ingredients with the hits listed", () => {
    expect(S.matchMeals("  TAC ").map((r) => r.m.name)).toEqual(["Tacos"]);
    const [r] = S.matchMeals("mince");
    expect(r.m.name).toBe("Tacos");
    expect(r.hit).toEqual(["beef mince"]);
    expect(S.matchMeals("rice")[0].hit).toEqual(["rice"]);
    expect(S.matchMeals("zzz")).toEqual([]);
  });
});
