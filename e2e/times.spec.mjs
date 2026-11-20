// Meal times on a device-only build: the tabs on Week, planning a meal for yourself, Fill empty
// days, where shopping items come from, and adding and changing meal times in Settings.
import { open, assert, pause } from "./lib.mjs";
import { thisWeek } from "../src/dates.js";

const WK = thisWeek();
const DAY = { Fri: 1, Sat: 2, Sun: 3, Mon: 4, Tue: 5, Wed: 6, Thu: 7 };
const row = (pg, d) => pg.locator(`#days .day:nth-child(${DAY[d]})`);
const pick = async (pg, d, name) => {
  await row(pg, d).click();
  await pg.locator("#pickList button[data-meal]", { hasText: name }).click();
  await pause(80);
};
const tab = (pg, name) => pg.locator("#timeTabs button", { hasText: name }).click();
const planned = (pg) => pg.locator("#days .day .m:not(.empty)").allTextContents();
const stored = (pg) => pg.evaluate(() => JSON.parse(localStorage.getItem("dinner-planner-v1")));
const tag = (pg, item) => pg.locator("#shopList .item", { hasText: item }).locator(".qty").allTextContents();

// A list as it was saved before meal times existed.
const old = {
  name: "Home",
  meals: [
    { id: "a", name: "Apple pie", ingredients: [{ name: "apple", optional: false }], notes: "" },
    { id: "b", name: "Bread soup", ingredients: [{ name: "bread", optional: false }], notes: "" },
  ],
  weeks: { [WK]: { plan: { Fri: "a", Sat: "b", Sun: "a" }, checked: { bread: true }, extras: [] } },
  aisles: {},
};

export const tests = {
  "meal times: a list from before opens on Dinner with its dinners where they were": async (browser, url) => {
    const { pg, ctx, errors } = await open(browser, url, { seed: old });
    assert.deepEqual(await pg.locator("#timeTabs button").allTextContents(), ["Breakfast", "Lunch", "Dinner"]);
    assert.equal(await pg.getAttribute('#timeTabs button:text("Dinner")', "aria-pressed"), "true", "opens on Dinner");
    assert.deepEqual(await planned(pg), ["Apple pie", "Bread soup", "Apple pie"]);
    assert.equal(await pg.locator("#whoChips").isVisible(), false, "no person chips on a shared meal time");
    assert.equal(await pg.locator("#fillBtn").isVisible(), false);
    assert.equal(await pg.locator("#spinBtn").isVisible(), true);
    await pg.click("#t-shop");
    assert.deepEqual(await tag(pg, "apple"), ["2 meals"], "the tag it always had");
    assert.equal(await pg.locator("#shopList .item", { hasText: "bread" }).count(), 0, "still ticked");
    // planning another dinner writes where dinners always went
    await pg.click("#t-week");
    await pick(pg, "Mon", "Bread soup");
    const s = await stored(pg);
    assert.deepEqual(s.weeks[WK].plan, { Fri: "a", Sat: "b", Sun: "a", Mon: "b" });
    assert.equal("plans" in s.weeks[WK], false);
    assert.deepEqual(errors, []);
    await ctx.close();
  },

  "meal times: plan your own lunches, fill the empty days and undo": async (browser, url) => {
    const { pg, ctx, errors } = await open(browser, url);
    await pick(pg, "Fri", "Chicken gyros");
    await tab(pg, "Lunch");
    assert.deepEqual(await planned(pg), [], "lunch has its own week");
    assert.deepEqual(await pg.locator("#whoChips button").allTextContents(), ["Me"], "one person on this device");
    assert.equal(await pg.locator("#fillBtn").isVisible(), false, "nothing to copy yet");
    await row(pg, "Sat").click();
    assert.equal(await pg.textContent("#pickSub"), "Lunch · Me");
    await pg.locator("#pickList button[data-meal]", { hasText: "Gyozas" }).click();
    assert.equal(
      await pg.textContent("#fillBtn"),
      "Fill empty days with Gyozas",
      "first planned day when Monday is empty",
    );
    await pick(pg, "Mon", "Teriyaki chicken rice bowl");
    assert.equal(await pg.textContent("#fillBtn"), "Fill empty days with Teriyaki chicken rice bowl");
    await pg.click("#fillBtn");
    assert.match(await pg.textContent(".toast"), /^Filled 5 days\./);
    const all = await planned(pg);
    assert.equal(all.length, 7);
    assert.equal(all.filter((n) => n === "Teriyaki chicken rice bowl").length, 6);
    assert.equal(all[1], "Gyozas", "planned days are left alone");
    assert.equal(await pg.locator("#fillBtn").isVisible(), false, "hidden once the week is full");
    await pg.locator(".toast button", { hasText: "Undo" }).click();
    assert.deepEqual(await planned(pg), ["Gyozas", "Teriyaki chicken rice bowl"]);
    // clearing a day from the picker, and dinner untouched throughout
    await row(pg, "Sat").click();
    await pg.click("#vChange");
    assert.equal(await pg.textContent("#pickRemove"), "Clear day");
    await pg.click("#pickRemove");
    assert.deepEqual(await planned(pg), ["Teriyaki chicken rice bowl"]);
    await tab(pg, "Dinner");
    assert.deepEqual(await planned(pg), ["Chicken gyros"]);
    await row(pg, "Sat").click();
    assert.equal(await pg.locator("#pickSub").isVisible(), false, "dinner's picker is as it was");
    await pg.locator("#pickDlg [data-close]").click();
    assert.deepEqual(errors, []);
    await ctx.close();
  },

  "meal times: the shopping list takes every meal time and says where items come from": async (browser, url) => {
    const { pg, ctx, errors } = await open(browser, url);
    await pick(pg, "Fri", "Chicken gyros"); // chicken thigh, greek yoghurt, tomato, cucumber…
    await pick(pg, "Sat", "Red Thai chicken curry"); // chicken thigh, rice, lime…
    await tab(pg, "Lunch");
    await pick(pg, "Mon", "Teriyaki chicken rice bowl"); // chicken thigh, rice, teriyaki sauce
    await pg.click("#fillBtn");
    await tab(pg, "Breakfast");
    await pick(pg, "Mon", "Gyozas"); // pork mince, gyoza wrappers
    await pg.click("#t-shop");
    assert.deepEqual(await tag(pg, "chicken thigh"), ["2 meals + lunch"]);
    assert.deepEqual(await tag(pg, "rice"), ["dinner + lunch"]);
    assert.deepEqual(await tag(pg, "teriyaki sauce"), ["lunch"], "a lunch had all week is one tag");
    assert.deepEqual(await tag(pg, "pork mince"), ["breakfast"]);
    assert.deepEqual(await tag(pg, "lime"), [], "one dinner needs no tag");
    assert.equal(await pg.locator("#shopList .item", { hasText: "rice" }).count(), 1, "merged by name");
    assert.deepEqual(errors, []);
    await ctx.close();
  },

  "settings: add Morning tea and it becomes a tab on Week; rename, reorder, switch and delete": async (
    browser,
    url,
  ) => {
    const { pg, ctx, errors } = await open(browser, url);
    await pg.click("#timeAdd");
    assert.equal(await pg.locator("#settings").isVisible(), true, "the + opens Settings");
    assert.equal(await pg.textContent("#settings h1"), "Settings");
    assert.equal(await pg.textContent("#t-settings .lbl"), "Settings");
    const rows = () => pg.locator("#timesBody .trow strong").allTextContents();
    assert.deepEqual(await rows(), ["Breakfast", "Lunch", "Dinner"]);
    assert.match(await pg.textContent('#timesBody .trow[data-time="dinner"]'), /Shared/);
    assert.match(await pg.textContent('#timesBody .trow[data-time="lunch"]'), /Each person/);
    await pg.fill("#newTime", "Morning tea");
    await pg.click("#addTime");
    assert.deepEqual(await rows(), ["Breakfast", "Lunch", "Dinner", "Morning tea"]);
    const open1 = pg.locator("#timesBody .time:has(.tbody)");
    assert.equal(await open1.locator(".trow strong").textContent(), "Morning tea", "the new one opens");
    // move it up two places, then rename it
    await open1.locator('button[aria-label="Move Morning tea up"]').click();
    await open1.locator('button[aria-label="Move Morning tea up"]').click();
    assert.deepEqual(await rows(), ["Breakfast", "Morning tea", "Lunch", "Dinner"]);
    await open1.locator("input").fill("Smoko");
    await open1.locator("input").dispatchEvent("change");
    await pg.click("#t-week");
    assert.deepEqual(await pg.locator("#timeTabs button").allTextContents(), ["Breakfast", "Smoko", "Lunch", "Dinner"]);
    assert.equal(await pg.getAttribute('#timeTabs button:text("Dinner")', "aria-pressed"), "true");
    await tab(pg, "Smoko");
    await row(pg, "Mon").click();
    assert.equal(await pg.textContent("#pickSub"), "Smoko · Me");
    await pg.locator("#pickList button[data-meal]", { hasText: "Gyozas" }).click();
    await pg.click("#t-shop");
    assert.deepEqual(await tag(pg, "pork mince"), ["smoko"]);
    // shared: the chips go, the plan stays; undo puts it back
    await pg.click("#t-settings");
    await pg.locator("#timesBody .trow", { hasText: "Smoko" }).click();
    await open1.locator('.seg button:text("Shared")').click();
    assert.match(await pg.textContent(".toast"), /^Smoko is now shared\./);
    assert.match(await open1.locator(".trow").textContent(), /Shared/);
    await pg.click("#t-week");
    assert.equal(await pg.locator("#whoChips").isVisible(), false);
    assert.deepEqual(await planned(pg), ["Gyozas"], "your plan became the shared one");
    assert.equal(await pg.locator("#spinBtn").isVisible(), true);
    // deleting one with something planned asks first
    await pg.click("#t-settings");
    await pg.locator("#timesBody .trow", { hasText: "Smoko" }).click();
    await open1.locator("button", { hasText: "Delete meal time" }).click();
    assert.equal(await pg.textContent("#confirmTitle"), "Delete Smoko?");
    assert.match(await pg.textContent("#confirmMsg"), /^1 planned day will be removed/);
    await pg.click("#confirmOk");
    await pg.waitForFunction(() => document.querySelectorAll("#timesBody .trow").length === 3);
    assert.deepEqual(await rows(), ["Breakfast", "Lunch", "Dinner"]);
    await pg.click("#t-week");
    assert.deepEqual(await pg.locator("#timeTabs button").allTextContents(), ["Breakfast", "Lunch", "Dinner"]);
    assert.equal((await stored(pg)).weeks[WK], undefined, "its plans went with it");
    // down to one meal time, there is nothing left to delete
    await pg.click("#t-settings");
    for (const name of ["Breakfast", "Lunch"]) {
      await pg.locator("#timesBody .trow", { hasText: name }).click();
      await open1.locator("button", { hasText: "Delete meal time" }).click();
    }
    await pg.locator("#timesBody .trow", { hasText: "Dinner" }).click();
    assert.equal(await open1.locator("button", { hasText: "Delete meal time" }).count(), 0, "a list keeps one");
    assert.deepEqual(errors, []);
    await ctx.close();
  },

  "meal times: tabs, chips and Settings fit a 320px phone with 44px targets": async (browser, url) => {
    const { pg, ctx, errors } = await open(browser, url, { viewport: { width: 320, height: 700 } });
    await pg.click("#timeAdd");
    for (const name of ["Morning tea", "Afternoon tea", "Supper"]) {
      await pg.fill("#newTime", name);
      await pg.click("#addTime");
    }
    const fits = () => pg.evaluate(() => document.documentElement.scrollWidth <= innerWidth);
    assert.ok(await fits(), "Settings with a meal time open");
    const small = (sel) =>
      pg.evaluate(
        (q) =>
          [...document.querySelectorAll(q)]
            .filter((b) => b.getClientRects().length)
            .map((b) => [b.textContent || b.getAttribute("aria-label"), Math.round(b.getBoundingClientRect().height)])
            .filter(([, h]) => h < 44),
        sel,
      );
    assert.deepEqual(await small("#settings button, #settings input"), [], "Settings targets");
    await pg.click("#t-week");
    assert.ok(await fits(), "six tabs scroll sideways instead of widening the page");
    assert.ok(
      await pg.evaluate(() => {
        const n = document.getElementById("timeTabs");
        return n.scrollWidth > n.clientWidth;
      }),
      "the tab row overflows and scrolls",
    );
    await tab(pg, "Supper");
    assert.deepEqual(await small("#week button"), [], "Week targets");
    assert.deepEqual(errors, []);
    await ctx.close();
  },
};
