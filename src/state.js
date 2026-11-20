// Household state: meals, weeks and aisle overrides. One object, saved whole to localStorage; each
// operation also describes its change as a nested patch (DEL = remove) that sync.js merges into the
// household document. Views read `state` and call the operations below.
import { DAYS, addDays, dayName, parse, thisWeek, todayStr, weekStartOf, isDateKey } from "./dates.js";
import { AISLE_LABEL, guessAisle } from "./aisles.js";

export const STORAGE_KEY = "dinner-planner-v1";

export const ing = (name, optional) => ({ name, optional: !!optional });
export const maybeLast = (list) => list.sort((a, b) => a.optional - b.optional);
export const uid = () => Math.random().toString(36).slice(2, 9);
export const keyOf = (name) => name.trim().toLowerCase();
export const DEL = Symbol("delete");
const isMap = (v) => !!v && typeof v === "object" && !Array.isArray(v);
const copy = (v) => JSON.parse(JSON.stringify(v));
const cleanName = (v, max) => (typeof v === "string" ? v.trim().slice(0, max) : "");

// Meal times: what a list plans each day, in order. A shared one has one plan for the whole list;
// an "each" one has a plan per person. A list that has never changed them has these three.
export const ALL = "all"; // whose plan a shared one is
export const GUEST = "me"; // the one person on a device that isn't signed in
const defaultTimes = () => [
  { id: "breakfast", name: "Breakfast", each: true },
  { id: "lunch", name: "Lunch", each: true },
  { id: "dinner", name: "Dinner", each: false },
];
// Dinner shared by everyone is what the app planned before meal times, in each week's `plan`.
// It still lives there, so lists and devices from before read and write it unchanged.
const isLegacy = (time, who) => time === "dinner" && who === ALL;

// Accepts the document's map keyed by id (each with its place in the order) or state's own list.
function normaliseTimes(v) {
  const raw = isMap(v) ? Object.entries(v).map(([id, t]) => ({ ...(isMap(t) ? t : {}), id })) : v;
  const seen = new Set();
  const list = (Array.isArray(raw) ? raw.filter(isMap) : [])
    .map((t, i) => ({
      id: String(t.id || ""),
      name: cleanName(t.name, 30),
      each: !!t.each,
      order: Number.isFinite(t.order) ? t.order : i,
    }))
    .filter((t) => /^[a-z0-9]{1,20}$/.test(t.id) && t.id !== ALL && t.name && !seen.has(t.id) && seen.add(t.id))
    .sort((a, b) => a.order - b.order)
    .map(({ id, name, each }) => ({ id, name, each }));
  return list.length ? list : defaultTimes();
}

// plans[meal time][person or "all"][day], with anything empty or malformed dropped.
function normalisePlans(v) {
  const out = {};
  for (const [time, byWho] of Object.entries(isMap(v) ? v : {})) {
    for (const [who, days] of Object.entries(isMap(byWho) ? byWho : {})) {
      const plan = {};
      for (const d of DAYS) if (isMap(days) && typeof days[d] === "string" && days[d]) plan[d] = days[d];
      if (Object.keys(plan).length) (out[time] ??= {})[who] = plan;
    }
  }
  return out;
}

const DEFAULTS = {
  meals: [
    {
      id: "m1",
      name: "Rice cooker chicken",
      ingredients: [ing("chicken thigh"), ing("rice"), ing("spring onion"), ing("soy sauce")],
      notes: "Chuck it all in the rice cooker.",
    },
    {
      id: "m2",
      name: "Beef mince and sweet potato bowl",
      ingredients: [ing("beef mince"), ing("sweet potato"), ing("cottage cheese"), ing("honey"), ing("veg", 1)],
      notes: "",
    },
    {
      id: "m3",
      name: "Red Thai chicken curry",
      ingredients: [
        ing("red curry paste"),
        ing("coconut milk"),
        ing("chicken thigh"),
        ing("zucchini"),
        ing("carrot"),
        ing("capsicum"),
        ing("lime"),
        ing("coriander"),
        ing("rice"),
      ],
      notes: "",
    },
    { id: "m4", name: "Gyozas", ingredients: [ing("pork mince"), ing("gyoza wrappers")], notes: "Rando seasoning." },
    {
      id: "m5",
      name: "Chicken gyros",
      ingredients: [
        ing("chicken thigh"),
        ing("greek yoghurt"),
        ing("flatbread ingredients"),
        ing("tomato"),
        ing("cucumber"),
        ing("hummus", 1),
        ing("tzatziki", 1),
      ],
      notes: "Homemade flatbread. Tzatziki can be homemade from the yoghurt and cucumber.",
    },
    {
      id: "m6",
      name: "Teriyaki chicken rice bowl",
      ingredients: [ing("chicken thigh"), ing("rice"), ing("teriyaki sauce")],
      notes: "",
    },
    {
      id: "m7",
      name: "Beef mince tacos",
      ingredients: [
        ing("beef mince"),
        ing("tortillas"),
        ing("taco seasoning"),
        ing("onion"),
        ing("garlic"),
        ing("lettuce"),
        ing("tomato"),
        ing("cheese"),
      ],
      notes: "",
    },
    {
      id: "m8",
      name: "Spaghetti bolognese",
      ingredients: [ing("beef mince"), ing("spaghetti"), ing("tinned tomatoes"), ing("onion"), ing("garlic")],
      notes: "",
    },
  ],
  weeks: {},
};

const blankWeek = () => ({ plan: {}, checked: {}, extras: [] });
// `plans` is only there while it holds something, like `have`.
function prunePlans(w) {
  w.plans = normalisePlans(w.plans);
  if (!Object.keys(w.plans).length) delete w.plans;
}

// Repairs any stored shape into the current one. Safe to run on anything, including old data.
export function normalise(input) {
  const s = JSON.parse(JSON.stringify(input || {}));
  // the household document keeps meals as a map by id so edits are field-level
  if (isMap(s.meals)) s.meals = Object.values(s.meals);
  s.meals = Array.isArray(s.meals) ? s.meals.filter(isMap) : [];
  s.meals.forEach((m) => {
    const list = Array.isArray(m.ingredients) ? m.ingredients : [];
    m.ingredients = maybeLast(
      list
        .map((i) => (typeof i === "string" ? ing(keyOf(i)) : ing(keyOf(String(i.name || "")), i.optional)))
        .filter((i) => i.name),
    );
    m.notes = m.notes && m.notes !== "null" ? String(m.notes) : ""; // an old editor once saved null as text
  });
  s.weeks = isMap(s.weeks) ? s.weeks : {};
  s.aisles = isMap(s.aisles) ? s.aisles : {};
  s.name = typeof s.name === "string" && s.name.trim() ? s.name.trim().slice(0, 60) : "Home";
  s.members = isMap(s.members) ? s.members : {};
  s.invites = isMap(s.invites) ? s.invites : {};
  // the name each member goes by, written by that member
  s.people = Object.fromEntries(
    Object.entries(isMap(s.people) ? s.people : {})
      .map(([id, p]) => [id, { name: cleanName(isMap(p) ? p.name : "", 60) }])
      .filter(([, p]) => p.name),
  );
  s.mealTimes = normaliseTimes(s.mealTimes);
  for (const k in s.aisles) if (!AISLE_LABEL[s.aisles[k]]) delete s.aisles[k];

  // v1 kept a single week at the top level
  if (isMap(s.week)) {
    let ws = typeof s.weekStart === "string" ? s.weekStart : thisWeek();
    if (parse(ws).getDay() === 0) ws = addDays(ws, 1);
    ws = weekStartOf(parse(ws));
    if (!s.weeks[ws]) s.weeks[ws] = { plan: s.week, checked: s.checked || {}, extras: s.extras || [] };
  }
  delete s.week;
  delete s.checked;
  delete s.extras;
  delete s.weekStart;

  for (const k in s.weeks) {
    const w = isMap(s.weeks[k]) ? s.weeks[k] : {};
    w.plan = isMap(w.plan) ? w.plan : {};
    w.checked = isMap(w.checked) ? w.checked : {};
    w.extras = Array.isArray(w.extras) ? w.extras : [];
    // "already have it" marks, only present once something has been marked
    if (isMap(w.have) && Object.keys(w.have).length) w.have = { ...w.have };
    else delete w.have;
    prunePlans(w);
    s.weeks[k] = w;
  }

  // weeks keyed by a different start day (Monday, before the week moved to Friday):
  // each night moves to the week that now holds its date; ticks and extras follow the first day
  for (const k of Object.keys(s.weeks)) {
    if (!isDateKey(k)) {
      delete s.weeks[k];
      continue;
    }
    if (k === weekStartOf(parse(k))) continue;
    const w = s.weeks[k];
    delete s.weeks[k];
    for (let i = 0; i < 7; i++) {
      const date = addDays(k, i);
      const d = dayName(date);
      const v = w.plan[d];
      if (!v) continue;
      const nk = weekStartOf(parse(date));
      const nw = s.weeks[nk] || (s.weeks[nk] = blankWeek());
      if (!nw.plan[d]) nw.plan[d] = v;
    }
    const nk = weekStartOf(parse(k));
    const nw = s.weeks[nk] || (s.weeks[nk] = blankWeek());
    Object.assign(nw.checked, w.checked);
    if (w.have) nw.have = { ...nw.have, ...w.have };
    nw.extras.push(...w.extras);
  }
  return {
    name: s.name,
    members: s.members,
    invites: s.invites,
    people: s.people,
    mealTimes: s.mealTimes,
    meals: s.meals,
    weeks: s.weeks,
    aisles: s.aisles,
  };
}

// Meal times as the document keeps them: a map by id, each with its place in the order.
const timesDoc = (list) => Object.fromEntries(list.map((t, i) => [t.id, { name: t.name, each: t.each, order: i }]));

// The household document shape: meals keyed by id. Members, invites and people are never written
// from state, and meal times only once they differ from the three every list starts with.
export const toDoc = (s) => ({
  name: s.name,
  meals: Object.fromEntries(s.meals.map((m) => [m.id, m])),
  weeks: s.weeks,
  aisles: s.aisles,
  ...(JSON.stringify(s.mealTimes) === JSON.stringify(defaultTimes()) ? {} : { mealTimes: timesDoc(s.mealTimes) }),
});

function loadLocal() {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    return v ? JSON.parse(v) : null;
  } catch {
    return null;
  }
}
function storeLocal(s) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  } catch {
    /* private mode or full: in-memory state still works */
  }
}

// Live bindings: importers always see the current object.
export let state = normalise(loadLocal() || DEFAULTS);
export let viewWeek = thisWeek();

export function setViewWeek(k) {
  viewWeek = k;
}

// Who is using this device: their account id once signed in. Signing in or out changes who that
// is, and the plans made under the old id follow them.
export let me = GUEST;
export function setMe(id) {
  const next = id || GUEST;
  if (next === me) return;
  for (const w of Object.values(state.weeks))
    for (const byWho of Object.values(w.plans || {})) {
      if (byWho[me] && !byWho[next]) byWho[next] = byWho[me];
      delete byWho[me];
    }
  me = next;
  storeLocal(state);
}

// The meal time and person the Week tab is showing. Nothing chosen means dinner, and yourself.
let viewTime = null;
let viewWho = null;
export function setViewTime(id) {
  viewTime = id;
}
export function setViewWho(id) {
  viewWho = id;
}
// The meal the app is built around: Dinner, or failing that the first shared meal time.
export const mainTime = () =>
  state.mealTimes.find((t) => t.id === "dinner") || state.mealTimes.find((t) => !t.each) || state.mealTimes[0];
export const curTime = () => state.mealTimes.find((t) => t.id === viewTime) || mainTime();
export const isMain = () => curTime() === mainTime();

// Everyone who plans their own meals here, yourself first. A guest's device has just the one.
export function people() {
  if (me === GUEST) return [{ id: GUEST, name: "Me", you: true }];
  const named = (id) => state.people[id]?.name || "";
  const others = Object.keys(state.members)
    .filter((id) => id !== me)
    .sort((a, b) => named(a).localeCompare(named(b)) || a.localeCompare(b));
  return [me, ...others].map((id) => ({ id, name: named(id) || (id === me ? "Me" : "Member"), you: id === me }));
}
export const curWho = () => {
  if (!curTime().each) return ALL;
  return people().some((p) => p.id === viewWho) ? viewWho : me;
};
// You plan shared meals and your own; other people's are theirs to change.
export const canEdit = () => curWho() === ALL || curWho() === me;
export function replaceState(data) {
  state = normalise(data);
  storeLocal(state);
}

// Remote persistence is plugged in by sync.js; without it saves are local only.
let remote = null;
export function setRemote(fn) {
  remote = fn;
}

// Stores locally and hands the patch to sync. `patch` mirrors the document shape; DEL removes a field.
export function save(patch) {
  storeLocal(state);
  if (remote && patch) remote(patch);
}

// A week with nothing in it is dropped from state; the patch removes it from the document.
function weekPatch(key, change) {
  const w = state.weeks[key];
  const marks = w ? Object.keys(w.checked).length + Object.keys(w.have || {}).length : 0;
  if (w && !Object.keys(w.plan).length && !w.plans && !w.extras.length && !marks) {
    delete state.weeks[key];
    return { weeks: { [key]: DEL } };
  }
  return { weeks: { [key]: change } };
}

/* ---------- lookups ---------- */
export const mealById = (id) => state.meals.find((m) => m.id === id);

// Meals sorted by name, filtered by a search: name matches, or `hit` lists the matching ingredients.
export function matchMeals(raw) {
  const q = (raw || "").trim().toLowerCase();
  return [...state.meals]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((m) => {
      if (!q) return { m };
      if (m.name.toLowerCase().includes(q)) return { m };
      const hit = m.ingredients.filter((x) => x.name.toLowerCase().includes(q)).map((x) => x.name.toLowerCase());
      return hit.length ? { m, hit } : null;
    })
    .filter(Boolean);
}
export const aisleOf = (key) => (AISLE_LABEL[state.aisles[key]] ? state.aisles[key] : guessAisle(key));

// The week being viewed (or `key`). `create` materialises it in state so edits stick.
export function wk(create, key) {
  key = key || viewWeek;
  let w = state.weeks[key];
  if (!w) {
    w = blankWeek();
    if (create) state.weeks[key] = w;
  }
  return w;
}

// Nights that aren't a meal: the plan holds the key instead of a meal id.
export const SPECIAL = { out: "Eating out", leftovers: "Leftovers" };
// What a plan entry reads as: the meal's name, or Eating out or Leftovers.
export const labelOf = (v) => SPECIAL[v] || mealById(v)?.name || "";

// One plan of a week: day to meal id (or a SPECIAL key), for a meal time and a person or ALL.
export const planOf = (w, time, who) => (isLegacy(time, who) ? w.plan : w.plans?.[time]?.[who]) || {};
// The plan the Week tab is showing, for the viewed week or `key`.
export const curPlan = (key) => planOf(wk(false, key), curTime().id, curWho());
// The main meal's plan for the viewed week, as the Meals tab reports it.
export const mainPlan = () => planOf(wk(), mainTime().id, mainTime().each ? me : ALL);
// Every plan of a week that counts: one per shared meal time, one per person for the others.
// Plans left behind by someone who has gone, or by a deleted meal time, are not among them.
function livePlans(w) {
  const ids = people().map((p) => p.id);
  return state.mealTimes.flatMap((t) => (t.each ? ids : [ALL]).map((who) => [t, planOf(w, t.id, who)]));
}

// Most recent date (today or earlier) each meal was planned, keyed by meal id.
export function lastHad() {
  const today = todayStr();
  const out = {};
  for (const k in state.weeks) {
    for (const [, p] of livePlans(state.weeks[k]))
      DAYS.forEach((d, i) => {
        const id = p[d];
        if (!id || SPECIAL[id]) return;
        const date = addDays(k, i);
        if (date <= today && (!out[id] || date > out[id])) out[id] = date;
      });
  }
  return out;
}

// Ingredients for the viewed week from every meal time and person, merged by name. Optional only
// if every meal lists it as optional. `from` counts the meals wanting it under each meal time.
export function shoppingItems() {
  const map = new Map();
  for (const [t, plan] of livePlans(wk()))
    DAYS.forEach((d) => {
      const m = mealById(plan[d]);
      if (!m) return;
      m.ingredients.forEach((x) => {
        const k = keyOf(x.name);
        const it = map.get(k) || { key: k, name: x.name, meals: [], from: {}, optional: true };
        it.meals.push(m.name);
        it.from[t.id] = (it.from[t.id] || 0) + 1;
        if (!x.optional) it.optional = false;
        map.set(k, it);
      });
    });
  return [...map.values()];
}
// Where a shopping item comes from: "2 meals" for dinners as before, the meal time's name for
// anything else, e.g. "lunch", "dinner + lunch", "3 meals + breakfast". Empty for one dinner.
export function sourceTag(it) {
  const main = mainTime();
  const others = state.mealTimes.filter((t) => t !== main && it.from[t.id]);
  const n = it.from[main.id] || 0;
  const parts = others.map((t) => t.name.toLowerCase());
  if (n > 1) parts.unshift(`${n} meals`);
  else if (n && others.length) parts.unshift(main.name.toLowerCase());
  return parts.join(" + ");
}

/* ---------- operations ---------- */
// Writes days into one plan of a week and returns the patch. `changes` maps a day to what it
// now holds, or to nothing to clear it.
function writeDays(key, time, who, changes) {
  const w = wk(true, key);
  const plan = isLegacy(time, who) ? w.plan : (((w.plans ??= {})[time] ??= {})[who] ??= {});
  const days = {};
  for (const [d, v] of Object.entries(changes)) {
    if (v) plan[d] = v;
    else delete plan[d];
    days[d] = v || DEL;
  }
  prunePlans(w);
  return weekPatch(key, isLegacy(time, who) ? { plan: days } : { plans: { [time]: { [who]: days } } });
}
// These act on the plan the Week tab is showing, as they act on the week it is showing.
export function setNight(day, value) {
  save(writeDays(viewWeek, curTime().id, curWho(), { [day]: value }));
}
// Swap what two nights hold; an empty night swaps too, which moves the other one's dinner there.
// False when there is nothing to do.
export function swapNights(a, b) {
  const plan = curPlan();
  const va = plan[a];
  const vb = plan[b];
  if (a === b || va === vb) return false;
  save(writeDays(viewWeek, curTime().id, curWho(), { [a]: vb, [b]: va }));
  return true;
}
// Clears the plan being shown for that week; for the main meal the shopping ticks and extras go
// too, as they always have. Returns the week as it was so restoreWeek can undo it, or null if
// there was nothing to clear.
export function clearWeek(key) {
  const w = state.weeks[key];
  if (!w) return null;
  const was = copy(w);
  const time = curTime().id;
  const who = curWho();
  const change = {};
  if (isLegacy(time, who)) {
    w.plan = {};
    change.plan = DEL;
  } else if (w.plans?.[time]?.[who]) {
    delete w.plans[time][who];
    change.plans = { [time]: { [who]: DEL } };
  }
  if (isMain()) {
    w.checked = {};
    w.extras = [];
    delete w.have;
    Object.assign(change, { checked: DEL, have: DEL, extras: [] });
  }
  prunePlans(w);
  if (JSON.stringify(w) === JSON.stringify(was)) return null;
  save(weekPatch(key, change));
  return was;
}
export function restoreWeek(key, week) {
  if (!week) return;
  state.weeks[key] = week;
  save({ weeks: { [key]: week } });
}
// Nights from today on with nothing planned, in week order.
export function emptyNights() {
  const plan = curPlan();
  const today = todayStr();
  return DAYS.filter((d, i) => !plan[d] && addDays(viewWeek, i) >= today);
}
// What "Fill empty days" would copy: Monday's meal, or the first planned day's if Monday is empty.
export function fillSource() {
  const plan = curPlan();
  const real = (v) => (labelOf(v) ? v : null);
  return real(plan.Mon) || DAYS.map((d) => real(plan[d])).find(Boolean) || null;
}
export const fillDays = () => (fillSource() ? DAYS.filter((d) => !curPlan()[d]) : []);
// Copies that meal into every empty day of the plan being shown, and nowhere else. Returns what
// it filled so undoFill can take exactly those days back out, or null if there was nothing to do.
export function fillEmptyDays() {
  const value = fillSource();
  const days = fillDays();
  if (!days.length) return null;
  const done = { key: viewWeek, time: curTime().id, who: curWho(), days };
  save(writeDays(done.key, done.time, done.who, Object.fromEntries(days.map((d) => [d, value]))));
  return done;
}
export function undoFill(done) {
  save(writeDays(done.key, done.time, done.who, Object.fromEntries(done.days.map((d) => [d, null]))));
}
// Meals matching every term, by name or ingredient.
export function matchAll(terms) {
  const qs = (Array.isArray(terms) ? terms : [terms || ""]).map((t) => t.trim().toLowerCase()).filter(Boolean);
  return [...state.meals]
    .sort((a, b) => a.name.localeCompare(b.name))
    .filter((m) =>
      qs.every((q) => m.name.toLowerCase().includes(q) || m.ingredients.some((x) => x.name.toLowerCase().includes(q))),
    );
}
// What the wheel can land on: meals matching the terms, preferring ones not had this week or
// last, and never the one it just showed unless that's all there is.
function spinTiers(terms) {
  const all = matchAll(terms);
  const now = new Set(Object.values(curPlan()));
  const before = new Set(Object.values(curPlan(addDays(viewWeek, -7))));
  const tiers = [all.filter((m) => !now.has(m.id) && !before.has(m.id)), all.filter((m) => !now.has(m.id)), all];
  return { all, now, tiers };
}
export function spinPool(terms, prev) {
  const { tiers } = spinTiers(terms);
  for (const t of tiers) {
    const fresh = t.filter((m) => m.id !== prev);
    if (fresh.length) return fresh;
  }
  return tiers.find((t) => t.length) || [];
}
// Matching meals the wheel is leaving out, each with the reason, so the sheet can say why.
export function spinExcluded(terms) {
  const { all, now, tiers } = spinTiers(terms);
  const pool = new Set((tiers.find((t) => t.length) || []).map((m) => m.id));
  return all
    .filter((m) => !pool.has(m.id))
    .map((m) => ({ name: m.name, why: now.has(m.id) ? "planned this week" : "had last week" }));
}
export function spin(terms, prev) {
  const pool = spinPool(terms, prev);
  return pool.length ? pool[Math.floor(Math.random() * pool.length)] : null;
}
export function upsertMeal(id, { name, ingredients, notes }) {
  let m = mealById(id);
  if (m) Object.assign(m, { name, ingredients, notes });
  else {
    id = uid();
    m = { id, name, ingredients, notes };
    state.meals.push(m);
  }
  save({ meals: { [id]: m } });
  return id;
}
// Changes that reach across weeks and plans (deleting a meal or a meal time, switching who plans
// one) edit state freely, then patch the document with whatever differs from before.
function flatPlans() {
  const out = new Map();
  for (const [k, w] of Object.entries(state.weeks)) {
    for (const [d, v] of Object.entries(w.plan)) out.set(JSON.stringify([k, "plan", d]), v);
    for (const [time, byWho] of Object.entries(w.plans || {}))
      for (const [who, plan] of Object.entries(byWho))
        for (const [d, v] of Object.entries(plan)) out.set(JSON.stringify([k, "plans", time, who, d]), v);
  }
  return out;
}
function plansPatch(before) {
  const after = flatPlans();
  const weeks = {};
  for (const path of new Set([...before.keys(), ...after.keys()])) {
    if (before.get(path) === after.get(path)) continue;
    const [k, ...keys] = JSON.parse(path);
    let at = (weeks[k] ??= {});
    for (const key of keys.slice(0, -1)) at = at[key] ??= {};
    at[keys.at(-1)] = after.get(path) ?? DEL;
  }
  for (const k of Object.keys(weeks)) Object.assign(weeks, weekPatch(k, weeks[k]).weeks);
  return { weeks };
}
const everyPlan = (w) => [w.plan, ...Object.values(w.plans || {}).flatMap((byWho) => Object.values(byWho))];

export function deleteMeal(id) {
  state.meals = state.meals.filter((x) => x.id !== id);
  const before = flatPlans();
  for (const w of Object.values(state.weeks)) {
    for (const plan of everyPlan(w)) for (const d of DAYS) if (plan[d] === id) delete plan[d];
    prunePlans(w);
  }
  save({ meals: { [id]: DEL }, ...plansPatch(before) });
}

/* ---------- meal times ---------- */
// Every change writes the whole set: a list that has never changed them has none in its document.
const timesPatch = (gone) => ({ mealTimes: { ...timesDoc(state.mealTimes), ...(gone ? { [gone]: DEL } : {}) } });
const timeById = (id) => state.mealTimes.find((t) => t.id === id);

export function addMealTime(name) {
  name = cleanName(name, 30);
  if (!name) return null;
  const t = { id: uid(), name, each: true };
  state.mealTimes.push(t);
  save(timesPatch());
  return t.id;
}
export function renameMealTime(id, name) {
  const t = timeById(id);
  name = cleanName(name, 30);
  if (!t || !name || name === t.name) return false;
  t.name = name;
  save(timesPatch());
  return true;
}
// Move a meal time one place up (-1) or down (1) the order.
export function moveMealTime(id, by) {
  const i = state.mealTimes.findIndex((t) => t.id === id);
  const j = i + by;
  if (i < 0 || j < 0 || j >= state.mealTimes.length) return false;
  state.mealTimes.splice(j, 0, state.mealTimes.splice(i, 1)[0]);
  save(timesPatch());
  return true;
}
// How many days are planned under a meal time, across every week and person. With `others`,
// only the ones planned by people other than you.
export function plannedCount(id, { others = false } = {}) {
  let n = 0;
  for (const w of Object.values(state.weeks)) {
    if (!others) n += Object.keys(planOf(w, id, ALL)).length;
    for (const [who, plan] of Object.entries(w.plans?.[id] || {}))
      if (who !== ALL && !(others && who === me)) n += Object.keys(plan).length;
  }
  return n;
}
// A list always keeps one meal time. Deleting one takes everything planned under it too.
export function deleteMealTime(id) {
  if (!timeById(id) || state.mealTimes.length < 2) return false;
  const before = flatPlans();
  state.mealTimes = state.mealTimes.filter((t) => t.id !== id);
  for (const w of Object.values(state.weeks)) {
    if (id === "dinner") w.plan = {};
    if (w.plans) delete w.plans[id];
    prunePlans(w);
  }
  save({ ...timesPatch(id), ...plansPatch(before) });
  return true;
}
// Switch a meal time between shared and each person. Whoever switches keeps their plan: going
// shared, yours becomes the one plan and everyone else's go; going each person, the shared plan
// becomes yours and the others start empty. Returns what restoreWhoPlans needs to undo it.
export function setWhoPlans(id, each) {
  const t = timeById(id);
  if (!t || t.each === each) return null;
  const undo = {
    times: copy(state.mealTimes),
    weeks: copy(Object.fromEntries(Object.entries(state.weeks).map(([k, w]) => [k, { plan: w.plan, plans: w.plans }]))),
  };
  const before = flatPlans();
  for (const w of Object.values(state.weeks)) {
    const keep = { ...planOf(w, id, each ? ALL : me) };
    const has = Object.keys(keep).length > 0;
    if (each) {
      // yours from an earlier spell as each person stands if there is no shared plan to take over
      if (has) ((w.plans ??= {})[id] ??= {})[me] = keep;
      if (id === "dinner") w.plan = {};
      else if (w.plans?.[id]) delete w.plans[id][ALL];
    } else {
      if (w.plans) delete w.plans[id];
      if (id === "dinner") w.plan = keep;
      else if (has) ((w.plans ??= {})[id] ??= {})[ALL] = keep;
    }
    prunePlans(w);
  }
  t.each = each;
  save({ ...timesPatch(), ...plansPatch(before) });
  return undo;
}
export function restoreWhoPlans(undo) {
  const before = flatPlans();
  for (const [k, was] of Object.entries(undo.weeks)) {
    const w = (state.weeks[k] ??= blankWeek());
    w.plan = was.plan;
    w.plans = was.plans;
    prunePlans(w);
  }
  state.mealTimes = undo.times;
  save({ ...timesPatch(), ...plansPatch(before) });
}
export function tick(key, on) {
  const w = wk(true);
  if (on) w.checked[key] = true;
  else delete w.checked[key];
  save(weekPatch(viewWeek, { checked: { [key]: on ? true : DEL } }));
}
// "Already have it": the ingredient is needed but doesn't need buying this week.
export function setHave(key, on) {
  const w = wk(true);
  if (on) w.have = { ...w.have, [key]: true };
  else if (w.have) {
    delete w.have[key];
    if (!Object.keys(w.have).length) delete w.have;
  }
  save(weekPatch(viewWeek, { have: { [key]: on ? true : DEL } }));
}
// Extras are small and per week, so the list is written whole.
const extrasPatch = () => weekPatch(viewWeek, { extras: wk().extras });
export function addExtra(name) {
  wk(true).extras.push({ id: uid(), name, done: false });
  save(extrasPatch());
}
export function setExtraDone(extra, done) {
  extra.done = done;
  save(extrasPatch());
}
export function removeExtra(extra) {
  const w = wk(true);
  w.extras = w.extras.filter((y) => y !== extra);
  save(extrasPatch());
}
export function setName(name) {
  state.name = name.trim().slice(0, 60) || "Home";
  save({ name: state.name });
}
export function setAisle(key, aisle) {
  state.aisles[key] = aisle;
  save({ aisles: { [key]: aisle } });
}
