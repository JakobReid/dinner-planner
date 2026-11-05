import { open, assert, pause } from "./lib.mjs";
import { addDays, thisWeek } from "../src/dates.js";

// Old Monday-keyed data from before the week moved to Friday.
const seed = {
  meals: [
    { id: "a", name: "A", ingredients: [{ name: "apple", optional: false }], notes: "" },
    { id: "b", name: "B", ingredients: [{ name: "bread", optional: false }], notes: "" },
  ],
  weeks: {
    "2026-10-26": {
      plan: { Mon: "a", Thu: "b", Sat: "a", Sun: "b" },
      checked: { apple: true },
      extras: [{ id: "x", name: "Milk", done: false }],
    },
    "2026-11-02": { plan: { Tue: "b", Fri: "a" }, checked: {}, extras: [] },
  },
};

export const tests = {
  "weeks: run Friday to Thursday": async (browser, url) => {
    const { pg, ctx } = await open(browser, url);
    const order = (await pg.locator("#days .day .d").allTextContents()).map((t) => t.slice(0, 3));
    assert.deepEqual(order, ["Fri", "Sat", "Sun", "Mon", "Tue", "Wed", "Thu"]);
    assert.equal(await pg.textContent("#wkLabel"), "This week");
    assert.equal(await pg.locator("#days .day.today").count(), 1);
    await ctx.close();
  },
  "weeks: Monday-keyed data is re-homed into Friday weeks": async (browser, url) => {
    const { pg, ctx } = await open(browser, url, { seed });
    const weeks = await pg.evaluate(() => JSON.parse(localStorage.getItem("dinner-planner-v1")).weeks);
    // page load only reads; a save writes the migrated shape, so trigger one
    await pg.locator("#days .day").last().click();
    await pg.locator("#pickActs button.alt", { hasText: "Leftovers" }).click();
    await pause(100);
    const migrated = await pg.evaluate(() => JSON.parse(localStorage.getItem("dinner-planner-v1")).weeks);
    assert.deepEqual(migrated["2026-10-23"], {
      plan: { Mon: "a", Thu: "b" },
      checked: { apple: true },
      extras: [{ id: "x", name: "Milk", done: false }],
    });
    assert.deepEqual(migrated["2026-10-30"].plan, { Sat: "a", Sun: "b", Tue: "b", Thu: "leftovers" });
    assert.deepEqual(migrated["2026-11-06"].plan, { Fri: "a" });
    assert.ok(!migrated["2026-10-26"] && !migrated["2026-11-02"], "old keys gone");
    void weeks;
    await ctx.close();
  },
  "weeks: plan nights and clear": async (browser, url) => {
    const { pg, ctx } = await open(browser, url);
    await pg.click("#nextWk");
    for (const day of ["Fri", "Sat", "Sun"]) {
      await pg.locator("#days .day", { hasText: day }).click();
      await pg.locator("#pickList button[data-meal]").first().click();
      await pause(100);
    }
    assert.equal(await pg.locator("#days .day .m:not(.empty)").count(), 3, "three nights of next week planned");
    pg.once("dialog", (d) => d.accept());
    await pg.click("#clearWk");
    await pause(100);
    assert.equal(await pg.locator("#days .day .m.empty").count(), 7);
    await ctx.close();
  },
  "weeks: spin the wheel fills empty nights one at a time": async (browser, url) => {
    const { pg, ctx, errors } = await open(browser, url);
    await pg.click("#nextWk");
    await pg.click("#spinBtn");
    assert.equal(await pg.locator("#spinDlg[open]").count(), 1);
    assert.match(await pg.textContent("#spinTitle"), /^Friday/);
    assert.equal(await pg.textContent("#spinStep"), "Night 1 of 7");
    const landed = () => pg.waitForSelector("#spinReel.landed .strip span.pick i", { timeout: 4000 });
    await landed();
    const first = await pg.textContent("#spinReel .strip span.pick i");
    await pg.locator("#spinAgain").click();
    await landed();
    assert.notEqual(await pg.textContent("#spinReel .strip span.pick i"), first, "spin again moves on");
    await pg.fill("#spinQ", "rice");
    await pg.waitForSelector("#spinReel:not(.landed)"); // the search is debounced
    await landed();
    await pg.press("#spinQ", "Enter");
    assert.deepEqual(await pg.locator("#spinTags .tag").allTextContents(), ["rice×"], "committed as a tag");
    assert.equal(await pg.inputValue("#spinQ"), "");
    await landed();
    const keptName = await pg.textContent("#spinReel .strip span.pick i");
    await pg.locator("#spinKeep").click();
    // nothing is stored until the first save, so check the pick after keeping it
    const ricey = await pg.evaluate(() =>
      JSON.parse(localStorage.getItem("dinner-planner-v1"))
        .meals.filter((m) => /rice/i.test(m.name) || m.ingredients.some((x) => /rice/i.test(x.name)))
        .map((m) => m.name),
    );
    assert.ok(ricey.includes(keptName), `narrowed to rice: ${keptName} not in ${ricey}`);
    assert.equal(await pg.textContent("#spinStep"), "Night 2 of 7");
    assert.match(await pg.textContent("#spinTitle"), /^Saturday/);
    await landed();
    await pg.locator("#spinSkip").click();
    assert.equal(await pg.textContent("#spinStep"), "Night 3 of 7");
    await pg.fill("#spinQ", "tofu");
    await pause(400);
    assert.match(await pg.textContent("#spinReel .strip"), /Nothing with rice and tofu/, "tags stack");
    assert.equal(await pg.locator("#spinKeep[disabled]").count(), 1);
    await pg.locator("#spinTags .tag button").click();
    assert.equal(await pg.locator("#spinTags .tag").count(), 0, "tag removed");
    assert.match(await pg.textContent("#spinReel .strip"), /Nothing with tofu/);
    await pg.fill("#spinQ", "");
    await landed();
    await pg.locator("#spinDlg [data-close]").click();
    assert.equal(await pg.locator("#spinDlg[open]").count(), 0);
    const plan = await pg.evaluate(
      (k) => JSON.parse(localStorage.getItem("dinner-planner-v1")).weeks[k]?.plan || {},
      addDays(thisWeek(), 7),
    );
    assert.deepEqual(Object.keys(plan), ["Fri"], "only the kept night is planned");
    assert.equal(await pg.locator("#days .day").first().locator(".m .n").textContent(), keptName);
    assert.deepEqual(errors, []);
    await ctx.close();
  },
};
