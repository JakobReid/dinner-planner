// Sync against the Firebase emulators: new households, the legacy meals-array migration,
// two devices on one link, and writes queued while offline.
import { assert, open, pause } from "./lib.mjs";
import { thisWeek } from "../src/dates.js";

const FS = "http://127.0.0.1:8080/v1/projects/demo-dinner/databases/(default)/documents/households/";
const WK = thisWeek();
const code = () => "e2e" + Math.random().toString(36).slice(2).padEnd(21, "0");

// Emulator REST with the owner token bypasses rules; values come back in Firestore's typed JSON.
const rest = (id, init) =>
  fetch(FS + id, { ...init, headers: { authorization: "Bearer owner", "content-type": "application/json" } });
const str = (v) => ({ stringValue: v });
const plain = (v) => {
  if ("mapValue" in v)
    return Object.fromEntries(Object.entries(v.mapValue.fields || {}).map(([k, x]) => [k, plain(x)]));
  if ("arrayValue" in v) return (v.arrayValue.values || []).map(plain);
  return Object.values(v)[0];
};
const getDoc = async (id) => {
  const r = await rest(id);
  if (r.status === 404) return null;
  const d = await r.json();
  return plain({ mapValue: { fields: d.fields } });
};
const until = async (fn, what, ms = 8000) => {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    const v = await fn();
    if (v) return v;
    await pause(150);
  }
  throw new Error("timed out waiting for " + what);
};
const synced = (pg) => pg.waitForFunction(() => document.getElementById("sync").textContent.startsWith("Synced"));
const plan = async (pg, day) => {
  await pg.locator("#days .day", { hasText: day }).tap();
  await pg.locator("#pickList button[data-meal]").first().tap();
};
const noErrors = (errors) => assert.deepEqual(errors, [], "console errors");

export const tests = {
  "sync: a new link seeds the household from this device": async (browser, url) => {
    const id = code();
    const { pg, ctx, errors } = await open(browser, url + "?h=" + id);
    await synced(pg);
    const d = await until(async () => {
      const x = await getDoc(id);
      return x && x.meals ? x : null;
    }, "seed write");
    assert.equal(Object.keys(d.meals).length, 8, "seed meals as a map");
    assert.deepEqual(d.weeks, {});
    assert.equal(d.name, "Home");
    assert.equal(Object.keys(d.members).length, 1, "the device's user is the only member");
    assert.equal(await pg.textContent("#listBtn"), "Home");
    await plan(pg, "Mon");
    await until(async () => (await getDoc(id))?.weeks[WK]?.plan?.Mon, "planned night in the document");
    await synced(pg);
    noErrors(errors);
    await ctx.close();
  },

  "sync: a legacy array-of-meals document is migrated and stays writable": async (browser, url) => {
    const id = code();
    const meal = (mid, name) => ({
      mapValue: {
        fields: {
          id: str(mid),
          name: str(name),
          ingredients: { arrayValue: { values: [str("rice")] } },
          notes: str(""),
        },
      },
    });
    await rest(id, {
      method: "PATCH",
      body: JSON.stringify({
        fields: {
          meals: { arrayValue: { values: [meal("a1", "Old curry"), meal("a2", "Old tacos")] } },
          weeks: { mapValue: { fields: {} } },
          aisles: { mapValue: { fields: {} } },
        },
      }),
    });
    const { pg, ctx, errors } = await open(browser, url + "?h=" + id);
    await synced(pg);
    const d = await until(async () => {
      const x = await getDoc(id);
      return x && !Array.isArray(x.meals) ? x : null;
    }, "meals migrated to a map");
    assert.deepEqual(Object.keys(d.meals).sort(), ["a1", "a2"]);
    assert.equal(Object.keys(d.members).length, 1, "claimed by the device that opened it");
    assert.equal(d.meals.a1.ingredients[0].name, "rice");
    await plan(pg, "Tue");
    const after = await until(async () => (await getDoc(id))?.weeks[WK]?.plan?.Tue && getDoc(id), "night written");
    assert.equal(after.weeks[WK].plan.Tue, "a1", "picker lists the migrated meals alphabetically");
    assert.equal(await pg.locator(".toast").count(), 0, "no save error toast");
    noErrors(errors);
    await ctx.close();
  },

  "sync: two devices on one link see each other's changes": async (browser, url) => {
    const id = code();
    const a = await open(browser, url + "?h=" + id);
    await synced(a.pg);
    await until(() => getDoc(id), "seed");
    const b = await open(browser, url + "?h=" + id);
    await synced(b.pg);
    await plan(a.pg, "Wed");
    await b.pg.waitForFunction(() => !document.querySelector("#days .day:nth-child(6) .m.empty"));
    await plan(b.pg, "Thu");
    await a.pg.waitForFunction(() => !document.querySelector("#days .day:nth-child(7) .m.empty"));
    const d = await getDoc(id);
    assert.equal(Object.keys(d.weeks[WK].plan).sort().join(), "Thu,Wed", "both nights in the document");
    assert.equal(Object.keys(d.members).length, 2, "the second device joined by link");
    noErrors(a.errors);
    noErrors(b.errors);
    await a.ctx.close();
    await b.ctx.close();
  },

  "lists: rename, new list, switch back, leave": async (browser, url) => {
    const id = code();
    const { pg, ctx, errors } = await open(browser, url + "?h=" + id);
    await synced(pg);
    await until(async () => (await getDoc(id))?.meals, "seed");
    await pg.click("#listBtn");
    assert.equal(await pg.locator("#listsDlg[open]").count(), 1);
    await pg.fill("#listsBody input.lname", "Our place");
    await pg.locator("#listsBody input.lname").first().dispatchEvent("change");
    await until(async () => (await getDoc(id))?.name === "Our place", "rename written");
    assert.equal(await pg.textContent("#listBtn"), "Our place");
    pg.once("dialog", (d) => d.accept("Lake trip"));
    await pg.locator("#listsBody button", { hasText: "New list" }).click();
    await pg.waitForFunction(() => document.getElementById("listBtn").textContent === "Lake trip");
    const trip = new URL(pg.url()).searchParams.get("h");
    assert.notEqual(trip, id, "a new list has its own code");
    assert.equal(await pg.locator("#days .day .m:not(.empty)").count(), 0, "new list starts empty");
    assert.equal(await pg.locator("#mealList .meal").count(), 0);
    await pg.click("#listBtn");
    await pg.locator("#listsBody .lrow", { hasText: "Our place" }).click();
    await pg.waitForFunction(() => document.getElementById("listBtn").textContent === "Our place");
    assert.equal(await pg.locator("#mealList .meal").count(), 8, "back to the first list with its meals");
    await pg.click("#listBtn");
    pg.once("dialog", (d) => d.accept());
    await pg.locator("#listsBody button", { hasText: "Leave" }).click();
    await pg.waitForFunction(() => document.getElementById("listBtn").textContent === "Lake trip");
    await until(async () => (await getDoc(id)) === null, "last member out deletes the list");
    assert.deepEqual(errors, []);
    await ctx.close();
  },

  "sync: changes made offline land when back online": async (browser, url) => {
    const id = code();
    const { pg, ctx, errors } = await open(browser, url + "?h=" + id);
    await synced(pg);
    await until(() => getDoc(id), "seed");
    await ctx.setOffline(true);
    await plan(pg, "Fri");
    await pause(1500);
    assert.equal((await getDoc(id)).weeks[WK], undefined, "nothing written while offline");
    assert.match(await pg.locator("#sync").textContent(), /Saving|Offline/, "status shows the pending write");
    await ctx.setOffline(false);
    await until(async () => (await getDoc(id))?.weeks[WK]?.plan?.Fri, "queued write flushed");
    await synced(pg);
    // Chromium logs each blocked request while offline; those aren't app errors
    noErrors(errors.filter((e) => !e.includes("ERR_INTERNET_DISCONNECTED")));
    await ctx.close();
  },
};
