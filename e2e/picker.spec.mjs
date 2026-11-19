import { open, assert, pause } from "./lib.mjs";

const firstDay = (pg) => pg.locator("#days .day").first();
const stored = (pg) => pg.evaluate(() => JSON.parse(localStorage.getItem("dinner-planner-v1")));

export const tests = {
  "picker: Eating out and Leftovers are chips above the list, rows have no edit icon": async (browser, url) => {
    const { pg, ctx, errors } = await open(browser, url);
    assert.equal(await firstDay(pg).locator(".m.empty").textContent(), "", "empty nights stay blank");
    await firstDay(pg).click();
    assert.equal(await pg.locator("#pickDlg[open]").count(), 1);
    assert.deepEqual(await pg.locator("#pickChips button").allTextContents(), ["Eating out", "Leftovers"]);
    assert.equal(await pg.locator("#pickList button").count(), 8, "one button per meal, nothing else to mis-tap");
    await pg.locator("#pickChips button", { hasText: "Leftovers" }).click();
    await pause(100);
    assert.equal(await firstDay(pg).locator(".m").textContent(), "Leftovers");
    await firstDay(pg).click();
    await pg.click("#pickRemove");
    await pause(100);
    assert.equal(await firstDay(pg).locator(".m.empty").count(), 1, "removed from the night");
    assert.deepEqual(errors, []);
    await ctx.close();
  },
  "picker: add a meal from the picker and it is picked for that night": async (browser, url) => {
    const { pg, ctx, errors } = await open(browser, url);
    await firstDay(pg).click();
    await pg.click("#pickNew");
    assert.equal(await pg.textContent("#mealTitle"), "Add a meal");
    assert.equal(await pg.inputValue("#mName"), "");
    await pg.fill("#mName", "Fish and chips");
    // typing in the last row adds the next; the old "maybe" prefix still marks a row optional
    const row = (n) => pg.locator("#mIngRows .ingrow").nth(n);
    await row(0).locator(".ing").fill("Fish");
    await row(1).locator(".ing").fill("Maybe Tartare Sauce");
    await row(2).locator(".ing").fill("  POTATOES ");
    await row(3).locator(".ing").fill("Lemon");
    await row(3).locator(".optl").click();
    assert.equal(await pg.locator("#mIngRows .ingrow").count(), 5, "a blank row waits at the end");
    await pg.click("#mealForm button[type=submit]");
    await pause(150);
    assert.equal(await pg.locator("dialog[open]").count(), 0, "both sheets closed");
    assert.match(await firstDay(pg).locator(".m").textContent(), /^Fish and chips/);
    const ings = (await stored(pg)).meals.find((m) => m.name === "Fish and chips").ingredients;
    assert.deepEqual(ings, [
      { name: "fish", optional: false },
      { name: "potatoes", optional: false },
      { name: "tartare sauce", optional: true },
      { name: "lemon", optional: true },
    ]);
    // existing optional ingredients come back as toggled rows, not "maybe" text
    await pg.click("#t-meals");
    await pg.locator("#mealList .meal", { hasText: "Fish and chips" }).click();
    assert.equal(await row(2).locator(".ing").inputValue(), "tartare sauce");
    assert.equal(await row(2).locator(".optl input").isChecked(), true);
    assert.equal(await row(0).locator(".optl input").isChecked(), false);
    assert.deepEqual(errors, []);
    await ctx.close();
  },
  "picker: no-match search offers to add that name": async (browser, url) => {
    const { pg, ctx } = await open(browser, url);
    await pg.locator("#days .day").nth(1).click();
    await pg.fill("#pickQ", "Laksa");
    await pause(100);
    assert.equal(await pg.locator("#pickList .nores").textContent(), "+ Add “Laksa”");
    await pg.locator("#pickList .nores").click();
    assert.equal(await pg.inputValue("#mName"), "Laksa");
    await pg.click("#mealForm button[type=submit]");
    await pause(150);
    assert.equal(await pg.locator("#days .day").nth(1).locator(".m").textContent(), "Laksa");
    await ctx.close();
  },
  "editor: delete asks first, then takes the meal off its nights": async (browser, url) => {
    const { pg, ctx, errors } = await open(browser, url);
    await firstDay(pg).click();
    await pg.locator("#pickList button[data-meal]", { hasText: "Gyozas" }).click();
    await pause(100);
    await pg.click("#t-meals");
    await pg.locator("#mealList .meal", { hasText: "Gyozas" }).click();
    await pg.click("#mDel");
    assert.equal(await pg.textContent("#confirmTitle"), "Delete Gyozas?");
    await pg.locator("#confirmDlg [data-close]").click();
    assert.equal(await pg.locator("#mealDlg[open]").count(), 1, "cancel keeps the editor open");
    assert.equal((await stored(pg)).meals.length, 8, "and the meal");
    await pg.click("#mDel");
    await pg.click("#confirmOk");
    await pause(150);
    assert.equal(await pg.locator("dialog[open]").count(), 0);
    assert.equal(await pg.locator("#mealList .meal").count(), 7);
    await pg.click("#t-week");
    assert.equal(await firstDay(pg).locator(".m.empty").count(), 1, "came off the night");
    assert.deepEqual(errors, []);
    await ctx.close();
  },
  "view: a planned night shows the meal read-only; Edit, Change and Remove all work": async (browser, url) => {
    const { pg, ctx, errors } = await open(browser, url);
    await firstDay(pg).click();
    await pg.locator("#pickList button[data-meal]", { hasText: "Chicken gyros" }).click();
    await pause(100);
    assert.equal(await firstDay(pg).locator(".m").textContent(), "Chicken gyros", "name only on the week list");
    await firstDay(pg).click();
    assert.equal(await pg.locator("#viewDlg[open]").count(), 1);
    assert.equal(await pg.textContent("#viewTitle"), "Chicken gyros", "the meal is the title");
    assert.match(await pg.textContent("#viewSub"), /^Friday /, "the night is the subtitle");
    assert.equal(await pg.locator("#viewBody .vlist li").count(), 7);
    assert.equal(await pg.locator("#viewBody .vlist li small", { hasText: "optional" }).count(), 2);
    assert.equal(await pg.locator("#viewBody label, #viewBody input, #viewBody textarea").count(), 0, "no form");
    await pg.click("#vEdit");
    assert.equal(await pg.textContent("#mealTitle"), "Edit meal");
    await pg.fill("#mName", "Chicken gyros wraps");
    await pg.click("#mealForm button[type=submit]");
    await pause(150);
    assert.equal(await firstDay(pg).locator(".m").textContent(), "Chicken gyros wraps");
    await firstDay(pg).click();
    await pg.click("#vChange");
    await pause(100);
    assert.equal(await pg.locator("#viewDlg[open]").count(), 0);
    assert.equal(await pg.locator("#pickDlg[open]").count(), 1, "picker open for the same night");
    await pg.locator("#pickList button[data-meal]", { hasText: "Gyozas" }).click();
    await pause(100);
    assert.equal(await firstDay(pg).locator(".m").textContent(), "Gyozas");
    await firstDay(pg).click();
    await pg.click("#vRemove");
    await pause(100);
    assert.equal(await firstDay(pg).locator(".m.empty").count(), 1, "removed from the night");
    assert.equal((await stored(pg)).meals.length, 8, "the meal itself stays");
    assert.deepEqual(errors, []);
    await ctx.close();
  },
  "picker: Enter picks the first match": async (browser, url) => {
    const { pg, ctx } = await open(browser, url);
    await pg.locator("#days .day").nth(2).click();
    await pg.fill("#pickQ", "spag");
    await pg.press("#pickQ", "Enter");
    await pause(150);
    assert.match(await pg.locator("#days .day").nth(2).locator(".m").textContent(), /^Spaghetti bolognese/);
    await ctx.close();
  },
  "picker: long lists scroll while the chips and footer stay put": async (browser, url) => {
    const meals = Array.from({ length: 40 }, (_, i) => ({
      id: "m" + i,
      name: "Meal number " + String(i).padStart(2, "0"),
      ingredients: [{ name: "thing " + i, optional: false }],
      notes: "",
    }));
    const { pg, ctx } = await open(browser, url, { viewport: { width: 390, height: 700 }, seed: { meals, weeks: {} } });
    await firstDay(pg).click();
    await pause(300);
    assert.equal(await pg.locator("#pickList button[data-meal]").count(), 40);
    await pg.evaluate(() => {
      const l = document.querySelector("#pickDlg .sheet-body");
      if (l.scrollHeight <= l.clientHeight) throw new Error("list should scroll");
      l.scrollTop = l.scrollHeight;
    });
    const chips = await pg.locator("#pickChips").boundingBox();
    const close = await pg.locator("#pickDlg [data-close]").boundingBox();
    const add = await pg.locator("#pickNew").boundingBox();
    assert.ok(chips.y >= 0, "chips still on screen after scrolling the list");
    assert.ok(close.y + close.height <= 700 && add.y + add.height <= 700, "footer on screen");
    assert.ok(close.x < add.x, "Close on the left, the main action on the right");
    await ctx.close();
  },
};
