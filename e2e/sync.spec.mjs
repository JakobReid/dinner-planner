// Sync against the Firebase emulators: guests stay local, first sign-in seeds a list, invite links,
// the legacy meals-array migration, two devices on one link, and writes queued while offline.
import { assert, open, pause } from "./lib.mjs";
import { thisWeek } from "../src/dates.js";

const DOCS = "http://127.0.0.1:8080/v1/projects/demo-dinner/databases/(default)/documents/";
const AUTH = "http://127.0.0.1:9099/emulator/v1/projects/demo-dinner/";
const FS = DOCS + "households/";
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
const synced = (pg) => pg.waitForFunction(() => document.getElementById("sync").dataset.state === "ok");
const plan = async (pg, day) => {
  await pg.locator("#days .day", { hasText: day }).tap();
  await pg.locator("#pickList button[data-meal]").first().tap();
};
const noErrors = (errors) => assert.deepEqual(errors, [], "console errors");
const hParam = (pg) => new URL(pg.url()).searchParams.get("h");
const who = (pg) => pg.locator("#whoName").textContent();

// Sign in with an email link: ask the app for one, read the code off the auth emulator, open it.
const signIn = async (pg, email = code() + "@e2e.test") => {
  if (!(await pg.locator("#acctDlg[open]").count())) await pg.click("#acctBtn");
  await pg.fill("#acctBody input[type=email]", email);
  await pg.locator("#acctBody button", { hasText: "Email me a link" }).click();
  const { oobCode, oobLink } = await until(async () => {
    const r = await fetch(AUTH + "oobCodes", { headers: { authorization: "Bearer owner" } });
    return (await r.json()).oobCodes.find((c) => c.email === email);
  }, "sign-in link");
  const to = new URL(new URL(oobLink).searchParams.get("continueUrl"));
  to.searchParams.set("apiKey", "fake");
  to.searchParams.set("oobCode", oobCode);
  to.searchParams.set("mode", "signIn");
  await pg.goto(to.toString());
  await pg.waitForSelector("#days .day", { state: "attached" });
  await pg.waitForFunction(() => document.getElementById("whoName").textContent !== "Guest");
  await until(() => hParam(pg), "list code in the url");
  await synced(pg);
  return email;
};

export const tests = {
  "guest: plans stay on this device and nothing syncs": async (browser, url) => {
    const { pg, ctx, errors } = await open(browser, url);
    await synced(pg);
    assert.equal(await who(pg), "Guest");
    assert.equal(hParam(pg), null, "no list code for a guest");
    await plan(pg, "Mon");
    await pg.click("#listsBtn");
    assert.equal(await pg.locator("#listsBody button", { hasText: "Invite someone" }).count(), 0, "no sharing");
    await pg.locator("#listsBody button", { hasText: "Sign in" }).click();
    assert.equal(await pg.locator("#acctDlg[open]").count(), 1, "nudged to the account dialog");
    await pg.reload();
    await pg.waitForSelector("#days .day", { state: "attached" });
    assert.equal(await pg.locator("#days .day:nth-child(4) .m.empty").count(), 0, "plan kept on the device");
    assert.equal(hParam(pg), null);
    noErrors(errors);
    await ctx.close();
  },

  "sync: first sign-in seeds exactly one Home list from this device": async (browser, url) => {
    const { pg, ctx, errors } = await open(browser, url);
    await synced(pg);
    await plan(pg, "Mon");
    await signIn(pg);
    const id = hParam(pg);
    const d = await until(async () => {
      const x = await getDoc(id);
      return x && x.meals ? x : null;
    }, "seed write");
    assert.equal(Object.keys(d.meals).length, 8, "the device's meals came along");
    assert.equal(d.weeks[WK].plan.Mon.length > 0, true, "and its plan");
    assert.equal(d.name, "Home");
    const uid = Object.keys(d.members)[0];
    const user = await until(async () => {
      const r = await fetch(DOCS + "users/" + uid, { headers: { authorization: "Bearer owner" } });
      return r.ok ? plain({ mapValue: { fields: (await r.json()).fields } }) : null;
    }, "user doc");
    assert.deepEqual(Object.keys(user.households), [id], "one household, not a stray second one");
    noErrors(errors);
    await ctx.close();
  },

  "sync: a guest on an invite link is asked to sign in, then joins and seeds it": async (browser, url) => {
    const id = code();
    const { pg, ctx, errors } = await open(browser, url + "?h=" + id);
    await pg.waitForSelector("#acctDlg[open]");
    assert.match(await pg.locator("#acctBody").textContent(), /invited/, "says why");
    assert.equal(await getDoc(id), null, "nothing written while a guest");
    await signIn(pg);
    assert.equal(hParam(pg), id, "still on the invited list");
    const d = await until(async () => {
      const x = await getDoc(id);
      return x && x.meals ? x : null;
    }, "seed write");
    assert.equal(Object.keys(d.meals).length, 8, "seed meals as a map");
    assert.deepEqual(d.weeks, {});
    assert.equal(d.name, "Home");
    assert.equal(Object.keys(d.members).length, 1, "the device's user is the only member");
    await plan(pg, "Mon");
    await until(async () => (await getDoc(id))?.weeks[WK]?.plan?.Mon, "planned night in the document");
    await synced(pg);
    noErrors(errors);
    await ctx.close();
  },

  "sync: signing out leaves a local copy and no list code": async (browser, url) => {
    const { pg, ctx, errors } = await open(browser, url);
    await signIn(pg);
    await plan(pg, "Tue");
    await synced(pg);
    await pg.click("#acctBtn");
    await pg.locator("#acctBody button", { hasText: "Sign out" }).click();
    await pg.waitForFunction(() => document.getElementById("whoName").textContent === "Guest");
    assert.equal(hParam(pg), null);
    assert.equal(await pg.locator("#days .day:nth-child(5) .m.empty").count(), 0, "copy stays on the device");
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
    await signIn(pg);
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
    assert.equal(await pg.locator(".toast", { hasText: "Couldn’t" }).count(), 0, "no save error toast");
    noErrors(errors);
    await ctx.close();
  },

  "sync: two devices on one link see each other's changes": async (browser, url) => {
    const id = code();
    const a = await open(browser, url + "?h=" + id);
    await signIn(a.pg);
    await until(async () => (await getDoc(id))?.meals, "seed");
    const b = await open(browser, url + "?h=" + id);
    await signIn(b.pg);
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
    const email = await signIn(pg);
    await until(async () => (await getDoc(id))?.meals, "seed");
    await pg.click("#acctBtn");
    assert.equal(await pg.locator("#acctDlg[open]").count(), 1);
    assert.match(await pg.locator("#acctBody").textContent(), new RegExp(email), "shows who's signed in");
    await pg.locator("#acctDlg [data-close]").click();
    await pg.click("#listsBtn");
    assert.equal(await pg.locator("#listsDlg[open]").count(), 1);
    assert.equal(await pg.locator("#listsBody button", { hasText: "Sign in" }).count(), 0, "account kept apart");
    await pg.fill("#listsBody input.lname", "Our place");
    await pg.locator("#listsBody input.lname").first().dispatchEvent("change");
    await until(async () => (await getDoc(id))?.name === "Our place", "rename written");
    await pg.locator("#listsDlg [data-close]").click();
    await pg.click("#listsBtn");
    assert.equal(await pg.inputValue("#listsBody input.lname"), "Our place", "rename shows on reopen");
    pg.once("dialog", (d) => d.accept("Lake trip"));
    await pg.locator("#listsBody button", { hasText: "New list" }).click();
    const trip = await until(async () => {
      const c = new URL(pg.url()).searchParams.get("h");
      return c !== id ? c : null;
    }, "new list opened");
    await synced(pg);
    assert.equal(await pg.locator("#days .day .m:not(.empty)").count(), 0, "new list starts empty");
    assert.equal(await pg.locator("#mealList .meal").count(), 0);
    await pg.click("#listsBtn");
    await pg.locator("#listsBody .lrow", { hasText: "Our place" }).click();
    await until(async () => new URL(pg.url()).searchParams.get("h") === id, "switched back");
    await until(
      async () => (await pg.locator("#mealList .meal").count()) === 8,
      "back to the first list with its meals",
    );
    await pg.click("#listsBtn");
    pg.once("dialog", (d) => d.accept());
    await pg.locator("#listsBody button", { hasText: "Leave" }).click();
    await until(async () => new URL(pg.url()).searchParams.get("h") === trip, "left to the other list");
    await until(async () => (await getDoc(id)) === null, "last member out deletes the list");
    assert.deepEqual(errors, []);
    await ctx.close();
  },

  "sync: changes made offline land when back online": async (browser, url) => {
    const id = code();
    const { pg, ctx, errors } = await open(browser, url + "?h=" + id);
    await signIn(pg);
    await until(async () => (await getDoc(id))?.meals, "seed");
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
