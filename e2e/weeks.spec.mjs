import { open, assert, pause } from "./lib.mjs";

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
    await pg.locator("#pickActs button.alt", { hasText: "Eating out" }).click();
    await pause(100);
    const migrated = await pg.evaluate(() => JSON.parse(localStorage.getItem("dinner-planner-v1")).weeks);
    assert.deepEqual(migrated["2026-10-23"], {
      plan: { Mon: "a", Thu: "b" },
      checked: { apple: true },
      extras: [{ id: "x", name: "Milk", done: false }],
    });
    assert.deepEqual(migrated["2026-10-30"].plan, { Sat: "a", Sun: "b", Tue: "b", Thu: "out" });
    assert.deepEqual(migrated["2026-11-06"].plan, { Fri: "a" });
    assert.ok(!migrated["2026-10-26"] && !migrated["2026-11-02"], "old keys gone");
    void weeks;
    await ctx.close();
  },
  "weeks: fill empty nights and clear": async (browser, url) => {
    const { pg, ctx } = await open(browser, url);
    await pg.click("#nextWk");
    await pg.click("#fill");
    await pause(150);
    assert.equal(await pg.locator("#days .day .m:not(.empty)").count(), 7, "every night of next week filled");
    const names = await pg.locator("#days .day .m").allTextContents();
    assert.equal(new Set(names).size, 7, "no repeats with 8 meals");
    pg.once("dialog", (d) => d.accept());
    await pg.click("#clearWk");
    await pause(100);
    assert.equal(await pg.locator("#days .day .m.empty").count(), 7);
    await ctx.close();
  },
};
