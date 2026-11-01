import { open, assert, pause } from "./lib.mjs";

const firstDay = (pg) => pg.locator("#days .day").first();

export const tests = {
  "picker: edit a meal from the picker and stay in the picker": async (browser, url) => {
    const { pg, ctx, errors } = await open(browser, url);
    await firstDay(pg).click();
    assert.equal(await pg.locator("#pickDlg[open]").count(), 1);
    assert.equal(await pg.locator("#pickList .pr button.edit").count(), 8);
    await pg.locator("#pickList .pr", { hasText: "Gyozas" }).locator("button.edit").click();
    assert.equal(await pg.textContent("#mealTitle"), "Edit meal");
    await pg.fill("#mName", "Pork gyozas");
    await pg.click("#mealForm button[type=submit]");
    await pause(150);
    assert.equal(await pg.locator("#pickDlg[open]").count(), 1, "picker still open");
    assert.equal(await pg.locator("#mealDlg[open]").count(), 0, "editor closed");
    assert.equal(await pg.locator("#pickList button[data-meal]", { hasText: "Pork gyozas" }).count(), 1);
    assert.equal(await firstDay(pg).locator(".m.empty").count(), 1, "night untouched");
    assert.deepEqual(errors, []);
    await ctx.close();
  },
  "picker: add a meal from the picker and it is picked for that night": async (browser, url) => {
    const { pg, ctx, errors } = await open(browser, url);
    await firstDay(pg).click();
    await pg.locator("#pickActs button.alt", { hasText: "Add a new meal" }).click();
    assert.equal(await pg.textContent("#mealTitle"), "Add a meal");
    assert.equal(await pg.inputValue("#mName"), "");
    await pg.fill("#mName", "Fish and chips");
    await pg.fill("#mIng", "Fish\nMaybe Tartare Sauce\n  POTATOES ");
    await pg.click("#mealForm button[type=submit]");
    await pause(150);
    assert.equal(await pg.locator("dialog[open]").count(), 0, "both dialogs closed");
    assert.match(await firstDay(pg).locator(".m").textContent(), /^Fish and chips/);
    const ings = await pg.evaluate(
      () =>
        JSON.parse(localStorage.getItem("dinner-planner-v1")).meals.find((m) => m.name === "Fish and chips")
          .ingredients,
    );
    assert.deepEqual(ings, [
      { name: "fish", optional: false },
      { name: "potatoes", optional: false },
      { name: "tartare sauce", optional: true },
    ]);
    assert.deepEqual(errors, []);
    await ctx.close();
  },
  "picker: no-match search offers to add that name": async (browser, url) => {
    const { pg, ctx } = await open(browser, url);
    await pg.locator("#days .day").nth(1).click();
    await pg.fill("#pickQ", "Laksa");
    await pause(100);
    assert.equal(await pg.locator("#pickActs button.alt").first().textContent(), "Add “Laksa” as a new meal");
    await pg.locator("#pickActs button.alt").first().click();
    assert.equal(await pg.inputValue("#mName"), "Laksa");
    await pg.click("#mealForm button[type=submit]");
    await pause(150);
    assert.equal(await pg.locator("#days .day").nth(1).locator(".m").textContent(), "Laksa");
    await ctx.close();
  },
  "picker: delete from the picker refreshes it and clears the night": async (browser, url) => {
    const { pg, ctx } = await open(browser, url);
    await firstDay(pg).click();
    await pg.locator("#pickList button[data-meal]").first().click();
    await pause(100);
    const name = (await firstDay(pg).locator(".m").textContent()).split(/[A-Z]/)[0];
    pg.once("dialog", (d) => d.accept());
    await pg.locator("#days .day").nth(2).click();
    const before = await pg.locator("#pickList button[data-meal]").count();
    await pg.locator("#pickList .pr").first().locator("button.edit").click();
    await pg.click("#mDel");
    await pause(150);
    assert.equal(await pg.locator("#pickDlg[open]").count(), 1, "picker still open");
    assert.equal(await pg.locator("#pickList button[data-meal]").count(), before - 1);
    assert.equal(await firstDay(pg).locator(".m.empty").count(), 1, `${name} came off the night`);
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
  "picker: long lists scroll while the actions stay visible": async (browser, url) => {
    const meals = Array.from({ length: 40 }, (_, i) => ({
      id: "m" + i,
      name: "Meal number " + String(i).padStart(2, "0"),
      ingredients: [{ name: "thing " + i, optional: false }],
      notes: "",
    }));
    const { pg, ctx } = await open(browser, url, { viewport: { width: 390, height: 700 }, seed: { meals, weeks: {} } });
    await firstDay(pg).click();
    assert.equal(await pg.locator("#pickList button[data-meal]").count(), 40);
    assert.ok(
      await pg.evaluate(() => {
        const l = document.getElementById("pickList");
        return l.scrollHeight > l.clientHeight;
      }),
      "list scrolls",
    );
    const acts = await pg.locator("#pickActs").boundingBox();
    const cancel = await pg.locator("#pickDlg [data-close]").boundingBox();
    assert.ok(acts.y + acts.height <= 700 && cancel.y + cancel.height <= 700, "actions and cancel on screen");
    await ctx.close();
  },
};
