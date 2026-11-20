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
const who = (pg) => pg.getAttribute("#t-settings", "data-who");

// Ask the app for an email link and read it off the auth emulator, as the address the app would open.
const requestLink = async (pg, email) => {
  if (await pg.locator("#settings").isHidden()) await pg.click("#t-settings");
  await pg.fill("#acctEmail", email);
  await pg.locator("#acctBody button", { hasText: "Email me a link" }).click();
  const { oobCode, oobLink } = await until(async () => {
    const r = await fetch(AUTH + "oobCodes", { headers: { authorization: "Bearer owner" } });
    return (await r.json()).oobCodes.find((c) => c.email === email);
  }, "sign-in link");
  const to = new URL(new URL(oobLink).searchParams.get("continueUrl"));
  to.searchParams.set("apiKey", "fake");
  to.searchParams.set("oobCode", oobCode);
  to.searchParams.set("mode", "signIn");
  return to.toString();
};
const signedIn = (pg) => pg.waitForFunction(() => document.getElementById("t-settings").dataset.who !== "Guest");

// Sign in with an email link: ask for one, then open it.
const signIn = async (pg, email = code() + "@e2e.test") => {
  await pg.goto(await requestLink(pg, email));
  await pg.waitForSelector("#days .day", { state: "attached" });
  await signedIn(pg);
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
    await pg.click("#t-settings");
    assert.equal(await pg.locator("#inviteBtn, #leaveList, #newListBtn").count(), 0, "no sharing for a guest");
    assert.equal(await pg.locator("#acctBody button", { hasText: "Sign in with Google" }).count(), 1);
    // the email field sits above its button, full width, so the placeholder isn't cut short
    const [field, btn] = await Promise.all(
      ["#acctEmail", "#acctBody button:text('Email me a link')"].map((q) => pg.locator(q).boundingBox()),
    );
    assert.ok(field.y + field.height <= btn.y && Math.abs(field.width - btn.width) < 2, "stacked");
    await pg.locator("#acctBody button", { hasText: "Email me a link" }).click();
    const toast = await pg.locator(".toast").boundingBox();
    const bar = await pg.locator(".tabbar").boundingBox();
    assert.match(await pg.locator(".toast").textContent(), /Enter your email first/);
    assert.ok(toast.y + toast.height <= bar.y, "toast sits above the tab bar");
    await pg.click("#t-week");
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
    await pg.waitForSelector("#settings:not([hidden])");
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
    await pg.click("#t-settings");
    await pg.locator("#acctBody button", { hasText: "Sign out" }).click();
    await pg.waitForFunction(() => document.getElementById("t-settings").dataset.who === "Guest");
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

  "sync: a list code alone doesn't get you into someone else's list": async (browser, url) => {
    const id = code();
    const a = await open(browser, url + "?h=" + id);
    await signIn(a.pg);
    await until(async () => (await getDoc(id))?.meals, "seed");
    const b = await open(browser, url + "?h=" + id);
    await signIn(b.pg);
    assert.notEqual(hParam(b.pg), id, "bounced to a list of their own");
    assert.match(await b.pg.locator(".toast").textContent(), /hasn’t invited/);
    assert.equal(Object.keys((await getDoc(id)).members).length, 1, "nobody was added");
    noErrors(a.errors);
    noErrors(b.errors);
    await a.ctx.close();
    await b.ctx.close();
  },

  "sync: an invited email finds the list on sign-in and both see each other's changes": async (browser, url) => {
    const id = code();
    const a = await open(browser, url + "?h=" + id);
    await signIn(a.pg);
    await until(async () => (await getDoc(id))?.meals, "seed");
    const emailB = code() + "@e2e.test";
    await a.pg.click("#t-settings");
    await a.pg.fill("#inviteEmail", emailB.toUpperCase());
    await a.pg.click("#inviteBtn");
    await until(async () => (await getDoc(id))?.invites?.[emailB], "invite written, lowercased");
    await a.pg.waitForSelector(`#acctBody .irow:has-text("${emailB}")`);
    await a.pg.click("#t-week");
    const b = await open(browser, url); // no link needed
    await signIn(b.pg, emailB);
    assert.equal(hParam(b.pg), id, "landed straight in the shared list");
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

  "meal times: two people plan their own lunches, see each other's read-only, and shop for both": async (
    browser,
    url,
  ) => {
    const id = code();
    const a = await open(browser, url + "?h=" + id);
    await signIn(a.pg, "jakob." + code() + "@e2e.test");
    await until(async () => (await getDoc(id))?.meals, "seed");
    const emailB = "partner." + code() + "@e2e.test";
    await a.pg.click("#t-settings");
    await a.pg.fill("#inviteEmail", emailB);
    await a.pg.click("#inviteBtn");
    await until(async () => (await getDoc(id))?.invites?.[emailB], "invite written");
    assert.equal(await a.pg.locator("#acctBody .prow:not(.irow)").count(), 1, "an invite is not a person yet");
    await a.pg.click("#t-week");
    await a.pg.locator("#timeTabs button", { hasText: "Lunch" }).click();
    assert.equal(await a.pg.locator("#whoChips button[data-who]").count(), 1, "no row for a pending invite");
    const b = await open(browser, url);
    await signIn(b.pg, emailB);
    // each of them adds the name the other sees
    const d0 = await until(async () => {
      const d = await getDoc(id);
      return d?.people && Object.keys(d.people).length === 2 ? d : null;
    }, "both names written");
    const [uidA, uidB] = ["Jakob", "Partner"].map((n) =>
      Object.keys(d0.people).find((u) => d0.people[u].name.startsWith(n)),
    );
    assert.ok(uidA && uidB, "names made from the addresses");
    const chips = (pg) => pg.locator("#whoChips button[data-who]").allTextContents();
    await until(async () => (await chips(a.pg)).join() === "Jakob,Partner", "A sees both, self first");
    await b.pg.locator("#timeTabs button", { hasText: "Lunch" }).click();
    await until(async () => (await chips(b.pg)).join() === "Partner,Jakob", "B sees both, self first");
    const lunch = async (pg, name) => {
      await pg.locator("#days .day:nth-child(4)").click();
      assert.match(await pg.textContent("#pickSub"), /^Lunch · (Jakob|Partner)$/);
      await pg.locator("#pickList button[data-meal]", { hasText: name }).click();
    };
    await lunch(a.pg, "Gyozas");
    await lunch(b.pg, "Spaghetti bolognese");
    const d = await until(async () => {
      const x = await getDoc(id);
      return Object.keys(x.weeks?.[WK]?.plans?.lunch || {}).length === 2 ? x : null;
    }, "both lunches in the document");
    assert.equal(d.weeks[WK].plans.lunch[uidA].Mon.length > 0, true);
    assert.notEqual(d.weeks[WK].plans.lunch[uidA].Mon, d.weeks[WK].plans.lunch[uidB].Mon, "different lunches");
    assert.equal("plan" in d.weeks[WK], false, "no dinner was touched");
    assert.equal("mealTimes" in d, false, "the default meal times are not written");
    // A looks at Partner's week: it shows, and it is theirs to change
    await a.pg.locator("#whoChips button", { hasText: "Partner" }).click();
    await a.pg.waitForFunction(() => /Spaghetti/.test(document.getElementById("days").textContent));
    assert.match(await a.pg.textContent("#whoNote"), /^Only Partner .* can change these\.$/);
    assert.equal(await a.pg.locator("#spinBtn").isVisible(), false);
    assert.equal(await a.pg.locator("#fillBtn").isVisible(), false);
    assert.equal(await a.pg.locator("#days .day:nth-child(5)").isDisabled(), true, "an empty day does nothing");
    await a.pg.locator("#days .day:nth-child(4)").click();
    assert.equal(await a.pg.textContent("#viewTitle"), "Spaghetti bolognese");
    assert.equal(await a.pg.locator("#vChange").isVisible(), false, "no Change on someone else's meal");
    assert.equal(await a.pg.locator("#vRemove").count(), 0);
    await a.pg.locator("#viewDlg [data-close]").click();
    // back on their own, A fills the week; Partner's stays as it was
    await a.pg.locator("#whoChips button", { hasText: "Jakob" }).click();
    await a.pg.click("#fillBtn");
    assert.match(await a.pg.textContent(".toast"), /^Filled 6 days\./);
    await until(async () => {
      const x = await getDoc(id);
      return Object.keys(x.weeks[WK].plans.lunch[uidA]).length === 7 ? x : null;
    }, "fill written");
    assert.deepEqual(Object.keys((await getDoc(id)).weeks[WK].plans.lunch[uidB]), ["Mon"]);
    // both lunches are on both shopping lists
    for (const pg of [a.pg, b.pg]) {
      await pg.click("#t-shop");
      await pg.waitForFunction(() => /pork mince/.test(document.getElementById("shopList").textContent));
      const tag = (item) => pg.locator("#shopList .item", { hasText: item }).locator(".qty").textContent();
      assert.equal(await tag("pork mince"), "lunch");
      assert.equal(await tag("spaghetti"), "lunch");
    }
    noErrors(a.errors);
    noErrors(b.errors);
    await a.ctx.close();
    await b.ctx.close();
  },

  "lists: rename, new list, switch back, leave": async (browser, url) => {
    const id = code();
    const { pg, ctx, errors } = await open(browser, url + "?h=" + id);
    const email = await signIn(pg, "sam.o-neil42." + code() + "@e2e.test");
    await until(async () => (await getDoc(id))?.meals, "seed");
    assert.match(await who(pg), /^Sam O Neil /, "a display name made from the address, not the address");
    await pg.click("#t-settings");
    assert.equal(await pg.locator("#settings").isVisible(), true);
    assert.equal(await pg.textContent("#acctBody .who .avatar"), "SO", "initials on the avatar");
    assert.match(
      await pg.locator("#acctBody .who").textContent(),
      new RegExp(email),
      "the full address, not cut short",
    );
    assert.equal(await pg.locator("#acctBody button", { hasText: "Sign in" }).count(), 0, "signed in already");
    await pg.waitForFunction(() => /only list/.test(document.getElementById("leaveBody").textContent));
    assert.equal(await pg.locator("#leaveList").isDisabled(), true, "can't leave your only list");
    await pg.fill("#acctBody .nameedit input", "Our place");
    await pg.locator("#acctBody .nameedit input").dispatchEvent("change");
    await until(async () => (await getDoc(id))?.name === "Our place", "rename written");
    assert.match(await pg.locator(".toast").textContent(), /renamed to Our place/, "the rename is confirmed");
    await pg.click("#t-week");
    await pg.click("#t-settings");
    assert.equal(await pg.inputValue("#acctBody .nameedit input"), "Our place", "rename shows on reopen");
    await pg.click("#switchList");
    await pg.fill("#newListName", "Lake trip");
    await pg.click("#newListBtn");
    const trip = await until(async () => {
      const c = new URL(pg.url()).searchParams.get("h");
      return c !== id ? c : null;
    }, "new list opened");
    await synced(pg);
    assert.equal(await pg.locator("#days .day .m:not(.empty)").count(), 0, "new list starts empty");
    assert.equal(await pg.locator("#mealList .meal").count(), 0);
    await pg.click("#t-settings");
    await pg.click("#switchList");
    await pg.locator("#listsBody .lrow", { hasText: "Our place" }).click();
    await until(async () => new URL(pg.url()).searchParams.get("h") === id, "switched back");
    await until(
      async () => (await pg.locator("#mealList .meal").count()) === 8,
      "back to the first list with its meals",
    );
    await pg.click("#t-settings");
    await pg.waitForFunction(() => !document.getElementById("leaveList").disabled);
    assert.match(await pg.locator("#leaveBody").textContent(), /Leaving deletes it/, "says what leaving does");
    await pg.click("#leaveList");
    assert.equal(await pg.textContent("#confirmTitle"), "Leave Our place?");
    await pg.locator("#confirmDlg [data-close]").click();
    assert.ok(await getDoc(id), "cancel leaves it alone");
    await pg.click("#leaveList");
    await pg.click("#confirmOk");
    await until(async () => new URL(pg.url()).searchParams.get("h") === trip, "left to the other list");
    await until(async () => (await getDoc(id)) === null, "last member out deletes the list");
    assert.deepEqual(errors, []);
    await ctx.close();
  },

  "sign-in: the emailed link can be pasted into the app instead of opened": async (browser, url) => {
    const { pg, ctx, errors } = await open(browser, url);
    await synced(pg);
    const email = code() + "@e2e.test";
    const link = await requestLink(pg, email);
    assert.equal(await pg.locator("#settings").isVisible(), true, "the profile tab stays up after sending");
    await pg.waitForSelector("#acctPaste[open]");
    await pg.fill("#acctLink", "https://example.com/not-a-link");
    await pg.locator("#acctBody button", { hasText: "Sign in with this link" }).click();
    await pg.waitForFunction(() => /isn’t a sign-in link/.test(document.querySelector(".toast").textContent));
    assert.equal(await who(pg), "Guest");
    await pg.fill("#acctLink", link);
    await pg.locator("#acctBody button", { hasText: "Sign in with this link" }).click();
    await signedIn(pg);
    await until(() => hParam(pg), "list code in the url");
    await synced(pg);
    assert.equal(await pg.locator("#settings").isVisible(), false, "back to the week once signed in");
    noErrors(errors);
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
