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
    nw.extras.push(...w.extras);
  }
  return { meals: s.meals, weeks: s.weeks, aisles: s.aisles };
}

// The household document shape: meals keyed by id.
export const toDoc = (s) => ({ ...s, meals: Object.fromEntries(s.meals.map((m) => [m.id, m])) });

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
  if (w && !Object.keys(w.plan).length && !w.extras.length && !Object.keys(w.checked).length) {
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

// Most recent date (today or earlier) each meal was planned, keyed by meal id.
export function lastHad() {
  const today = todayStr();
  const out = {};
  for (const k in state.weeks) {
    const p = state.weeks[k].plan;
    DAYS.forEach((d, i) => {
      const id = p[d];
      if (!id || id === "out") return;
      const date = addDays(k, i);
      if (date <= today && (!out[id] || date > out[id])) out[id] = date;
    });
  }
  return out;
}

// Ingredients for the viewed week, merged by name. Optional only if every meal lists it as optional.
export function shoppingItems() {
  const map = new Map();
  const plan = wk().plan;
  DAYS.forEach((d) => {
    const m = mealById(plan[d]);
    if (!m) return;
    m.ingredients.forEach((x) => {
      const k = keyOf(x.name);
      const it = map.get(k) || { key: k, name: x.name, meals: [], optional: true };
      it.meals.push(m.name);
      if (!x.optional) it.optional = false;
      map.set(k, it);
    });
  });
  return [...map.values()];
}

/* ---------- operations ---------- */
export function setNight(day, value) {
  const w = wk(true);
  if (value) w.plan[day] = value;
  else delete w.plan[day];
  save(weekPatch(viewWeek, { plan: { [day]: value || DEL } }));
}
export function clearWeek(key) {
  delete state.weeks[key];
  save({ weeks: { [key]: DEL } });
}
// Random meals for the empty nights from today on, avoiding this and last week's picks where possible.
export function fillEmptyNights() {
  const w = wk(true);
  const today = todayStr();
  const empty = DAYS.filter((d, i) => !w.plan[d] && addDays(viewWeek, i) >= today);
  if (!empty.length || !state.meals.length) return { empty, filled: [] };
  const used = new Set([...Object.values(w.plan), ...Object.values(wk(false, addDays(viewWeek, -7)).plan)]);
  let pool = state.meals.map((m) => m.id).filter((id) => !used.has(id));
  const filled = [];
  const plan = {};
  empty.forEach((d) => {
    if (!pool.length) pool = state.meals.map((m) => m.id).filter((id) => !Object.values(w.plan).includes(id));
    if (!pool.length) pool = state.meals.map((m) => m.id);
    const id = pool.splice(Math.floor(Math.random() * pool.length), 1)[0];
    w.plan[d] = plan[d] = id;
    filled.push(DAYS.indexOf(d));
  });
  save({ weeks: { [viewWeek]: { plan } } });
  return { empty, filled };
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
export function deleteMeal(id) {
  state.meals = state.meals.filter((x) => x.id !== id);
  const patch = { meals: { [id]: DEL }, weeks: {} };
  for (const k of Object.keys(state.weeks)) {
    const plan = {};
    for (const d of DAYS) {
      if (state.weeks[k].plan[d] !== id) continue;
      delete state.weeks[k].plan[d];
      plan[d] = DEL;
    }
    if (Object.keys(plan).length) Object.assign(patch.weeks, weekPatch(k, { plan }).weeks);
  }
  save(patch);
}
export function tick(key, on) {
  const w = wk(true);
  if (on) w.checked[key] = true;
  else delete w.checked[key];
  save(weekPatch(viewWeek, { checked: { [key]: on ? true : DEL } }));
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
export function untickAll() {
  const w = wk(true);
  w.checked = {};
  w.extras.forEach((x) => (x.done = false));
  save(weekPatch(viewWeek, { checked: DEL, extras: w.extras }));
}
export function setAisle(key, aisle) {
  state.aisles[key] = aisle;
  save({ aisles: { [key]: aisle } });
}
