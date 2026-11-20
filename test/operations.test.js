import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as S from "../src/state.js";

const { DEL } = S;
const meal = (id, name, ingredients = []) => ({ id, name, ingredients: ingredients.map((n) => S.ing(n)), notes: "" });
let patches;

beforeEach(() => {
  vi.useFakeTimers({ now: new Date(2026, 10, 2, 12) }); // Mon 2 Nov 2026, week of Fri 30 Oct
  patches = [];
  S.setRemote((p) => patches.push(p));
  S.setMe(null);
  S.setViewTime(null);
  S.setViewWho(null);
  S.replaceState({ meals: [meal("m1", "Tacos", ["beef mince", "lettuce"]), meal("m2", "Curry", ["rice"])] });
  S.setViewWeek("2026-10-30");
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

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

  it("emptyNights lists unplanned nights from today on", () => {
    S.setNight("Fri", "m1");
    S.setNight("Tue", "m2");
    expect(S.emptyNights()).toEqual(["Mon", "Wed", "Thu"]);
  });

  it("the wheel prefers meals not had this week or last, and never repeats the last spin", () => {
    S.replaceState({
      meals: [meal("m1", "Tacos", ["beef mince"]), meal("m2", "Curry", ["rice"]), meal("m3", "Fried rice", ["rice"])],
      weeks: { "2026-10-23": { plan: { Sat: "m3" } } },
    });
    S.setNight("Fri", "m1");
    expect(S.spinPool("").map((m) => m.id)).toEqual(["m2"], "m1 is this week, m3 was last week");
    expect(S.spinPool("rice").map((m) => m.id)).toEqual(["m2"]);
    expect(S.spinPool("rice", "m2").map((m) => m.id)).toEqual(["m3"], "falls back to last week's rather than repeat");
    expect(S.spinPool("tofu")).toEqual([]);
    expect(S.spinPool(["rice", "fried"]).map((m) => m.id)).toEqual(["m3"], "every term has to match");
    expect(S.spinPool(["rice", "beef"])).toEqual([]);
    S.setNight("Sat", "m2");
    expect(S.spinPool("").map((m) => m.id)).toEqual(["m3"], "last week's is fair game once this week is used up");
    vi.spyOn(Math, "random").mockReturnValue(0);
    expect(S.spin("").id).toBe("m3");
    expect(S.spin("tofu")).toBeNull();
  });

  it("lastHad reports the most recent past date per meal", () => {
    S.setNight("Fri", "m1"); // 30 Oct
    S.setNight("Wed", "m1"); // 4 Nov, future
    S.setViewWeek("2026-10-23");
    S.setNight("Sat", "m2"); // 24 Oct
    S.setNight("Sun", "out");
    S.setNight("Mon", "leftovers");
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

  it("extras are written whole and the last one out drops the week", () => {
    S.addExtra("foil");
    const [x] = S.wk().extras;
    S.setExtraDone(x, true);
    expect(last()).toEqual({ weeks: { "2026-10-30": { extras: [{ id: x.id, name: "foil", done: true }] } } });
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

describe("swapping nights", () => {
  it("swaps two planned nights in one patch", () => {
    S.setNight("Mon", "m1");
    S.setNight("Wed", "out");
    expect(S.swapNights("Mon", "Wed")).toBe(true);
    expect(S.state.weeks["2026-10-30"].plan).toEqual({ Mon: "out", Wed: "m1" });
    expect(last()).toEqual({ weeks: { "2026-10-30": { plan: { Mon: "out", Wed: "m1" } } } });
  });

  it("moves a dinner onto an empty night and clears where it was", () => {
    S.setNight("Mon", "m1");
    expect(S.swapNights("Mon", "Fri")).toBe(true);
    expect(S.state.weeks["2026-10-30"].plan).toEqual({ Fri: "m1" });
    expect(last().weeks["2026-10-30"].plan.Fri).toBe("m1");
    expect(Object.keys(last().weeks["2026-10-30"].plan)).toEqual(["Mon", "Fri"]);
  });

  it("does nothing for the same night or two empty ones", () => {
    expect(S.swapNights("Mon", "Mon")).toBe(false);
    expect(S.swapNights("Mon", "Tue")).toBe(false);
    expect(S.state.weeks).toEqual({});
  });
});

describe("undo and already-have", () => {
  it("a cleared week comes back whole with restoreWeek", () => {
    S.setNight("Mon", "m1");
    S.tick("rice", true);
    S.addExtra("Milk");
    const before = JSON.parse(JSON.stringify(S.state.weeks["2026-10-30"]));
    const was = S.clearWeek("2026-10-30");
    expect(S.state.weeks).toEqual({});
    S.restoreWeek("2026-10-30", was);
    expect(S.state.weeks["2026-10-30"]).toEqual(before);
    expect(last()).toEqual({ weeks: { "2026-10-30": before } });
  });

  it("clearing an empty week gives nothing to restore", () => {
    expect(S.clearWeek("2026-10-30")).toBe(null);
    S.restoreWeek("2026-10-30", null);
    expect(S.state.weeks).toEqual({});
  });

  it("have marks are per week, patch one field and vanish with the last one", () => {
    S.setNight("Mon", "m1");
    S.setHave("lettuce", true);
    expect(S.state.weeks["2026-10-30"].have).toEqual({ lettuce: true });
    expect(last()).toEqual({ weeks: { "2026-10-30": { have: { lettuce: true } } } });
    S.setHave("lettuce", false);
    expect("have" in S.state.weeks["2026-10-30"]).toBe(false);
    expect(last()).toEqual({ weeks: { "2026-10-30": { have: { lettuce: DEL } } } });
  });

  it("a week holding only a have mark is kept, and survives normalise", () => {
    S.setHave("rice", true);
    expect(S.state.weeks["2026-10-30"].have).toEqual({ rice: true });
    expect(S.normalise(S.state).weeks["2026-10-30"].have).toEqual({ rice: true });
    S.setHave("rice", false);
    expect(S.state.weeks).toEqual({});
  });

  it("the wheel says which matching meals it is leaving out, and why", () => {
    S.replaceState({ meals: [meal("m1", "Tacos"), meal("m2", "Curry"), meal("m3", "Pasta"), meal("m4", "Soup")] });
    S.setViewWeek("2026-10-23");
    S.setNight("Mon", "m2");
    S.setViewWeek("2026-10-30");
    S.setNight("Fri", "m1");
    expect(S.spinExcluded([])).toEqual([
      { name: "Curry", why: "had last week" },
      { name: "Tacos", why: "planned this week" },
    ]);
    expect(S.spinExcluded(["pasta"])).toEqual([]);
  });
});

// Two people signed in to one list: u1 is the one using this device.
function twoPeople(extra = {}) {
  S.replaceState({
    members: { u1: true, u2: true },
    people: { u1: { name: "Jakob Reid" }, u2: { name: "Partner" } },
    meals: [
      meal("m1", "Tacos", ["beef mince", "lettuce"]),
      meal("m2", "Curry", ["rice"]),
      meal("m3", "Oats", ["rolled oats", "greek yoghurt"]),
      meal("m4", "Tuna wraps", ["tinned tuna", "lettuce"]),
      meal("m5", "Rice bowl", ["rice", "chicken thigh"]),
    ],
    ...extra,
  });
  S.setMe("u1");
}
const WEEK = "2026-10-30";
const week = () => S.state.weeks[WEEK];

describe("meal times on the week", () => {
  beforeEach(() => twoPeople());

  it("opens on Dinner, shared, and each person's meal times default to yourself", () => {
    expect(S.curTime().id).toBe("dinner");
    expect(S.curWho()).toBe(S.ALL);
    S.setViewTime("lunch");
    expect(S.curWho()).toBe("u1");
    expect(S.people()).toEqual([
      { id: "u1", name: "Jakob Reid", you: true },
      { id: "u2", name: "Partner", you: false },
    ]);
    S.setViewWho("u2");
    expect(S.curWho()).toBe("u2");
    expect(S.canEdit()).toBe(false);
    S.setViewWho("gone");
    expect(S.curWho()).toBe("u1");
    expect(S.canEdit()).toBe(true);
  });

  it("a guest's device has one person, and their plans follow them when they sign in or out", () => {
    S.setMe(null);
    expect(S.people()).toEqual([{ id: "me", name: "Me", you: true }]);
    S.setViewTime("lunch");
    S.setNight("Mon", "m4");
    expect(week().plans).toEqual({ lunch: { me: { Mon: "m4" } } });
    S.setMe("u1");
    expect(week().plans).toEqual({ lunch: { u1: { Mon: "m4" } } });
    expect(S.toDoc(S.state).weeks[WEEK].plans).toEqual({ lunch: { u1: { Mon: "m4" } } });
    S.setMe(null);
    expect(week().plans).toEqual({ lunch: { me: { Mon: "m4" } } });
  });

  it("plans a lunch for one person and patches only that day, leaving dinner alone", () => {
    S.setNight("Mon", "m1");
    S.setViewTime("lunch");
    S.setNight("Mon", "m4");
    expect(week()).toMatchObject({ plan: { Mon: "m1" }, plans: { lunch: { u1: { Mon: "m4" } } } });
    expect(last()).toEqual({ weeks: { [WEEK]: { plans: { lunch: { u1: { Mon: "m4" } } } } } });
    S.setNight("Mon", null);
    expect("plans" in week()).toBe(false);
    expect(last()).toEqual({ weeks: { [WEEK]: { plans: { lunch: { u1: { Mon: DEL } } } } } });
    S.setViewTime("dinner");
    S.setNight("Mon", null);
    expect(last()).toEqual({ weeks: { [WEEK]: DEL } });
  });

  it("a week holding only someone's lunch is kept", () => {
    S.setViewTime("lunch");
    S.setNight("Tue", "m4");
    S.setViewTime("dinner");
    S.setNight("Tue", "m1");
    S.setNight("Tue", null);
    expect(week().plans).toEqual({ lunch: { u1: { Tue: "m4" } } });
  });

  it("swaps, the wheel and empty nights work on the plan being shown", () => {
    S.setNight("Mon", "m1");
    S.setViewTime("lunch");
    S.setNight("Mon", "m4");
    expect(S.swapNights("Mon", "Wed")).toBe(true);
    expect(week().plans.lunch.u1).toEqual({ Wed: "m4" });
    expect(week().plan).toEqual({ Mon: "m1" });
    expect(S.emptyNights()).toEqual(["Mon", "Tue", "Thu"]);
    expect(S.spinPool("").map((m) => m.id)).not.toContain("m4");
    expect(S.spinPool("").map((m) => m.id)).toContain("m1");
  });

  it("clearing the week on a lunch clears only that person's lunches", () => {
    S.setNight("Mon", "m1");
    S.tick("rice", true);
    S.setViewTime("lunch");
    S.setNight("Mon", "m4");
    S.setViewWho("u2");
    S.setNight("Mon", "m5");
    S.setViewWho("u1");
    const was = S.clearWeek(WEEK);
    expect(week()).toEqual({
      plan: { Mon: "m1" },
      checked: { rice: true },
      extras: [],
      plans: { lunch: { u2: { Mon: "m5" } } },
    });
    expect(last()).toEqual({ weeks: { [WEEK]: { plans: { lunch: { u1: DEL } } } } });
    expect(S.clearWeek(WEEK)).toBe(null);
    S.restoreWeek(WEEK, was);
    expect(week().plans.lunch).toEqual({ u1: { Mon: "m4" }, u2: { Mon: "m5" } });
  });

  it("clearing the week on Dinner takes the dinners, ticks and extras, and leaves the lunches", () => {
    S.setNight("Mon", "m1");
    S.tick("rice", true);
    S.addExtra("Milk");
    S.setViewTime("lunch");
    S.setNight("Mon", "m4");
    S.setViewTime("dinner");
    S.clearWeek(WEEK);
    expect(week()).toEqual({ plan: {}, checked: {}, extras: [], plans: { lunch: { u1: { Mon: "m4" } } } });
    expect(last()).toEqual({ weeks: { [WEEK]: { plan: DEL, checked: DEL, have: DEL, extras: [] } } });
  });

  it("deleting a meal unplans it from every meal time and person", () => {
    S.setNight("Fri", "m4");
    S.setViewTime("lunch");
    S.setNight("Mon", "m4");
    S.setNight("Tue", "m5");
    S.setViewWho("u2");
    S.setNight("Mon", "m4");
    S.deleteMeal("m4");
    expect(week()).toMatchObject({ plan: {}, plans: { lunch: { u1: { Tue: "m5" } } } });
    expect(last()).toEqual({
      meals: { m4: DEL },
      weeks: { [WEEK]: { plan: { Fri: DEL }, plans: { lunch: { u1: { Mon: DEL }, u2: { Mon: DEL } } } } },
    });
  });
});

describe("fill empty days", () => {
  beforeEach(() => {
    twoPeople();
    S.setViewTime("lunch");
  });

  it("has nothing to offer until something is planned, or once every day is", () => {
    expect(S.fillSource()).toBe(null);
    expect(S.fillEmptyDays()).toBe(null);
    for (const d of ["Fri", "Sat", "Sun", "Mon", "Tue", "Wed", "Thu"]) S.setNight(d, "m4");
    expect(S.fillDays()).toEqual([]);
    expect(S.fillEmptyDays()).toBe(null);
  });

  it("copies Monday's meal into every empty day for that person and meal time only", () => {
    S.setNight("Sat", "m5");
    S.setNight("Mon", "m4");
    S.setViewWho("u2");
    S.setNight("Tue", "m5");
    S.setViewWho("u1");
    S.setViewTime("breakfast");
    S.setNight("Wed", "m3");
    S.setViewTime("lunch");
    expect(S.labelOf(S.fillSource())).toBe("Tuna wraps");
    const done = S.fillEmptyDays();
    expect(done.days).toEqual(["Fri", "Sun", "Tue", "Wed", "Thu"]);
    expect(week().plans.lunch.u1).toEqual({
      Fri: "m4",
      Sat: "m5",
      Sun: "m4",
      Mon: "m4",
      Tue: "m4",
      Wed: "m4",
      Thu: "m4",
    });
    expect(week().plans.lunch.u2).toEqual({ Tue: "m5" });
    expect(week().plans.breakfast.u1).toEqual({ Wed: "m3" });
    expect(week().plan).toEqual({});
    expect(last()).toEqual({
      weeks: { [WEEK]: { plans: { lunch: { u1: { Fri: "m4", Sun: "m4", Tue: "m4", Wed: "m4", Thu: "m4" } } } } },
    });
  });

  it("uses the first planned day when Monday is empty, and copies Eating out too", () => {
    S.setNight("Sun", "out");
    S.setNight("Wed", "m5");
    expect(S.fillSource()).toBe("out");
    expect(S.labelOf(S.fillSource())).toBe("Eating out");
    expect(S.fillEmptyDays().days).toEqual(["Fri", "Sat", "Mon", "Tue", "Thu"]);
    expect(week().plans.lunch.u1.Mon).toBe("out");
  });

  it("undo takes back exactly the days it filled, even after moving to another view", () => {
    S.setNight("Mon", "m4");
    S.setNight("Tue", "m5");
    const done = S.fillEmptyDays();
    S.setViewTime("dinner");
    S.setViewWeek("2026-11-06");
    S.undoFill(done);
    expect(week().plans.lunch.u1).toEqual({ Mon: "m4", Tue: "m5" });
    expect(last()).toEqual({
      weeks: { [WEEK]: { plans: { lunch: { u1: { Fri: DEL, Sat: DEL, Sun: DEL, Wed: DEL, Thu: DEL } } } } },
    });
  });
});

describe("shopping across meal times", () => {
  beforeEach(() => twoPeople());
  const items = () => Object.fromEntries(S.shoppingItems().map((i) => [i.key, i]));
  const tags = () => Object.fromEntries(S.shoppingItems().map((i) => [i.key, S.sourceTag(i)]));

  it("a list that only plans dinners gets the tags it always had", () => {
    S.setNight("Fri", "m1");
    S.setNight("Sat", "m2");
    S.setNight("Sun", "m5");
    expect(tags()).toEqual({ "beef mince": "", lettuce: "", rice: "2 meals", "chicken thigh": "" });
    // the same dinner on two nights still counts as two meals
    S.setNight("Mon", "m1");
    expect(tags().lettuce).toBe("2 meals");
  });

  it("takes ingredients from every meal time and every person, merged by name", () => {
    S.setNight("Fri", "m1"); // dinner: beef mince, lettuce
    S.setNight("Sat", "m2"); // dinner: rice
    S.setViewTime("lunch");
    S.setNight("Mon", "m4"); // my lunch: tinned tuna, lettuce
    S.setViewWho("u2");
    S.setNight("Mon", "m5"); // their lunch: rice, chicken thigh
    S.setViewTime("breakfast");
    S.setViewWho("u1");
    S.setNight("Mon", "m3"); // my breakfast: rolled oats, greek yoghurt
    expect(Object.keys(items()).sort()).toEqual([
      "beef mince",
      "chicken thigh",
      "greek yoghurt",
      "lettuce",
      "rice",
      "rolled oats",
      "tinned tuna",
    ]);
    expect(items().lettuce.from).toEqual({ dinner: 1, lunch: 1 });
    expect(tags()).toEqual({
      "beef mince": "",
      "chicken thigh": "lunch",
      "greek yoghurt": "breakfast",
      lettuce: "dinner + lunch",
      rice: "dinner + lunch",
      "rolled oats": "breakfast",
      "tinned tuna": "lunch",
    });
  });

  it("a lunch had all week is just lunch; several dinners keep their count beside it", () => {
    S.setNight("Fri", "m2");
    S.setNight("Sat", "m5");
    S.setViewTime("lunch");
    for (const d of ["Fri", "Sat", "Sun", "Mon", "Tue", "Wed", "Thu"]) S.setNight(d, "m5");
    S.setViewTime("breakfast");
    S.setNight("Mon", "m2");
    expect(tags().rice).toBe("2 meals + breakfast + lunch");
    expect(tags()["chicken thigh"]).toBe("dinner + lunch");
  });

  it("plans left by someone who has gone, or for a deleted meal time, stay off the list", () => {
    S.setViewTime("lunch");
    S.setViewWho("u2");
    S.setNight("Mon", "m5");
    expect(Object.keys(items())).toEqual(["rice", "chicken thigh"]);
    delete S.state.members.u2;
    expect(S.shoppingItems()).toEqual([]);
  });

  it("a custom meal time shows by its own name", () => {
    const id = S.addMealTime("Morning tea");
    S.setViewTime(id);
    S.setNight("Mon", "m3");
    expect(tags()["rolled oats"]).toBe("morning tea");
  });
});

describe("managing meal times", () => {
  beforeEach(() => twoPeople());
  const names = () => S.state.mealTimes.map((t) => t.name);

  it("adds one for each person at the end and writes the whole set the first time", () => {
    expect("mealTimes" in S.toDoc(S.state)).toBe(false);
    const id = S.addMealTime("  Morning tea ");
    expect(names()).toEqual(["Breakfast", "Lunch", "Dinner", "Morning tea"]);
    expect(last()).toEqual({
      mealTimes: {
        breakfast: { name: "Breakfast", each: true, order: 0 },
        lunch: { name: "Lunch", each: true, order: 1 },
        dinner: { name: "Dinner", each: false, order: 2 },
        [id]: { name: "Morning tea", each: true, order: 3 },
      },
    });
    expect(S.addMealTime("   ")).toBe(null);
    expect(S.normalise(S.toDoc(S.state)).mealTimes).toEqual(S.state.mealTimes);
  });

  it("renames and reorders", () => {
    expect(S.renameMealTime("dinner", "Tea")).toBe(true);
    expect(S.renameMealTime("dinner", "  ")).toBe(false);
    expect(S.moveMealTime("dinner", -1)).toBe(true);
    expect(names()).toEqual(["Breakfast", "Tea", "Lunch"]);
    expect(S.moveMealTime("breakfast", -1)).toBe(false);
    expect(S.moveMealTime("lunch", 1)).toBe(false);
    expect(last().mealTimes.dinner).toEqual({ name: "Tea", each: false, order: 1 });
    // still the main meal after a rename
    expect(S.curTime().id).toBe("dinner");
  });

  it("deleting one removes what was planned under it, and the last one can't be deleted", () => {
    S.setNight("Fri", "m1");
    S.setViewTime("lunch");
    S.setNight("Mon", "m4");
    S.setViewWho("u2");
    S.setNight("Tue", "m5");
    expect(S.plannedCount("lunch")).toBe(2);
    expect(S.plannedCount("lunch", { others: true })).toBe(1);
    expect(S.plannedCount("dinner")).toBe(1);
    expect(S.deleteMealTime("lunch")).toBe(true);
    expect(names()).toEqual(["Breakfast", "Dinner"]);
    expect(week()).toEqual({ plan: { Fri: "m1" }, checked: {}, extras: [] });
    expect(last().mealTimes.lunch).toBe(DEL);
    expect(last().weeks).toEqual({ [WEEK]: { plans: { lunch: { u1: { Mon: DEL }, u2: { Tue: DEL } } } } });
    expect(S.curTime().id).toBe("dinner");
    S.deleteMealTime("dinner");
    expect(S.state.weeks).toEqual({});
    expect(last().weeks).toEqual({ [WEEK]: DEL });
    expect(S.deleteMealTime("breakfast")).toBe(false);
    expect(names()).toEqual(["Breakfast"]);
  });

  it("each person to shared: your plan becomes the shared one and the others' go; undo brings them back", () => {
    S.setViewTime("lunch");
    S.setNight("Mon", "m4");
    S.setViewWho("u2");
    S.setNight("Mon", "m5");
    S.setNight("Tue", "m5");
    const undo = S.setWhoPlans("lunch", false);
    expect(S.state.mealTimes.find((t) => t.id === "lunch").each).toBe(false);
    expect(week().plans).toEqual({ lunch: { all: { Mon: "m4" } } });
    expect(last().mealTimes.lunch).toEqual({ name: "Lunch", each: false, order: 1 });
    expect(last().weeks).toEqual({
      [WEEK]: { plans: { lunch: { all: { Mon: "m4" }, u1: { Mon: DEL }, u2: { Mon: DEL, Tue: DEL } } } },
    });
    expect(S.curWho()).toBe(S.ALL);
    S.restoreWhoPlans(undo);
    expect(S.state.mealTimes.find((t) => t.id === "lunch").each).toBe(true);
    expect(week().plans).toEqual({ lunch: { u1: { Mon: "m4" }, u2: { Mon: "m5", Tue: "m5" } } });
    expect(last().weeks).toEqual({
      [WEEK]: { plans: { lunch: { all: { Mon: DEL }, u1: { Mon: "m4" }, u2: { Mon: "m5", Tue: "m5" } } } },
    });
  });

  it("shared to each person: the shared plan becomes yours, in every week, and the others start empty", () => {
    S.setNight("Fri", "m1");
    S.setViewWeek("2026-11-06");
    S.setNight("Mon", "m2");
    const undo = S.setWhoPlans("dinner", true);
    expect(week()).toMatchObject({ plan: {}, plans: { dinner: { u1: { Fri: "m1" } } } });
    expect(S.state.weeks["2026-11-06"].plans).toEqual({ dinner: { u1: { Mon: "m2" } } });
    expect(last().weeks[WEEK]).toEqual({ plan: { Fri: DEL }, plans: { dinner: { u1: { Fri: "m1" } } } });
    expect(S.curWho()).toBe("u1");
    expect(S.curPlan()).toEqual({ Mon: "m2" });
    S.setViewWho("u2");
    expect(S.curPlan()).toEqual({});
    S.restoreWhoPlans(undo);
    expect(week()).toEqual({ plan: { Fri: "m1" }, checked: {}, extras: [] });
    expect(S.setWhoPlans("dinner", false)).toBe(null);
  });
});
