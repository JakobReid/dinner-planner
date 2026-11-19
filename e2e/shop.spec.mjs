import { open, assert, pause, box } from "./lib.mjs";

export const tests = {
  "shop: grouped by aisle with overrides that persist": async (browser, url) => {
    const { pg, ctx, errors } = await open(browser, url);
    // gyros (maybe hummus/tzatziki), tacos, curry, plus two extras
    for (const [n, name] of [
      [0, "Chicken gyros"],
      [1, "Beef mince tacos"],
      [2, "Red Thai chicken curry"],
    ]) {
      await pg.locator("#days .day").nth(n).click();
      await pg.locator("#pickList button[data-meal]", { hasText: name }).click();
      await pause(80);
    }
    await pg.click("#t-shop");
    for (const x of ["Bin bags", "Mystery thing"]) {
      await pg.fill("#extraIn", x);
      await pg.press("#extraIn", "Enter");
    }
    await pause(100);
    assert.deepEqual(await pg.locator("#shopList .group h2").allTextContents(), [
      "Fruit & veg",
      "Meat & seafood",
      "Dairy & eggs",
      "Bakery",
      "Pantry",
      "Household",
      "Other",
    ]);
    assert.equal(await pg.locator("#shopList .item.maybe").count(), 2, "optional rows");
    assert.equal(
      await pg.locator("#shopList .item", { hasText: "chicken thigh" }).locator(".qty").textContent(),
      "2 meals",
      "shared ingredients say how many meals, not a quantity",
    );
    assert.equal(
      await pg.locator('#shopList .group:has(h2:text("Household")) .item', { hasText: "Bin bags" }).count(),
      1,
    );
    assert.equal(
      await pg.locator('#shopList .group:has(h2:text("Other")) .item', { hasText: "Mystery thing" }).count(),
      1,
    );
    const badge = Number(await pg.textContent("#shopCount"));
    assert.equal(await pg.locator("#shopList select.aisle:visible").count(), 0, "pickers hidden by default");
    await pg.click("#aisleMode");
    assert.equal(await pg.textContent("#aisleMode"), "Done");
    const bar = await box(pg.locator(".shopbar"));
    const head = await box(pg.locator("header"));
    assert.ok(Math.abs(bar.top - head.bottom) <= 1, "Done sits in the bar under the header");
    await pg.locator("#shopList .item", { hasText: "tortillas" }).locator("select.aisle").selectOption("pantry");
    await pause(100);
    await pg.click("#aisleMode");
    assert.equal(
      await pg.locator('#shopList .group:has(h2:text("Pantry")) .item', { hasText: "tortillas" }).count(),
      1,
      "override moved it",
    );
    await pg.locator("#shopList .item", { hasText: "tortillas" }).locator("input").click();
    await pause(80);
    assert.equal(Number(await pg.textContent("#shopCount")), badge - 1, "badge drops on tick");
    assert.match(await pg.textContent("#shopSummary"), new RegExp(`^${badge - 1} to buy · 1 in the trolley`));
    assert.equal(
      await pg.locator("#shopList .item", { hasText: "tortillas" }).count(),
      0,
      "ticked items leave the list",
    );
    assert.equal(await pg.locator("#fold-trolley").getAttribute("open"), null, "the trolley starts folded");
    await pg.locator("#fold-trolley summary").click();
    assert.equal(await pg.locator("#fold-trolley .item", { hasText: "tortillas" }).count(), 1);
    await pg.locator("#fold-trolley .item", { hasText: "tortillas" }).locator("input").click();
    await pause(80);
    assert.equal(await pg.locator("#shopList .item", { hasText: "tortillas" }).count(), 1, "unticking puts it back");
    assert.equal(Number(await pg.textContent("#shopCount")), badge);
    // already have it: off the list and the count, with an undo and a way back
    await pg.locator("#shopList .item", { hasText: "garlic" }).locator(".have").click();
    await pause(80);
    assert.equal(Number(await pg.textContent("#shopCount")), badge - 1);
    await pg.locator(".toast button", { hasText: "Undo" }).click();
    await pause(80);
    assert.equal(Number(await pg.textContent("#shopCount")), badge, "undo");
    await pg.locator("#shopList .item", { hasText: "garlic" }).locator(".have").click();
    await pg.locator("#fold-have summary").click();
    assert.equal(await pg.locator("#fold-have .item", { hasText: "garlic" }).count(), 1);
    await pg.locator("#fold-have .item", { hasText: "garlic" }).locator(".have").click();
    await pause(80);
    assert.equal(await pg.locator("#shopList .item", { hasText: "garlic" }).count(), 1, "Add back");
    assert.equal(Number(await pg.textContent("#shopCount")), badge);
    // a long press offers the aisles without going into Edit aisles
    await pg.locator("#shopList .item", { hasText: "lime" }).evaluate((e) => e.scrollIntoView({ block: "center" }));
    const lime = await pg.locator("#shopList .item", { hasText: "lime" }).locator("label").boundingBox();
    await pg.mouse.move(lime.x + 30, lime.y + lime.height / 2);
    await pg.mouse.down();
    await pause(700);
    await pg.mouse.up();
    assert.equal(await pg.locator("#aisleDlg[open]").count(), 1, "long press opens the move sheet");
    await pg.locator("#aisleList button", { hasText: "Drinks" }).click();
    await pause(80);
    assert.equal(await pg.locator('#shopList .group:has(h2:text("Drinks")) .item', { hasText: "lime" }).count(), 1);
    assert.equal(await pg.locator("#fold-trolley .item", { hasText: "lime" }).count(), 0, "and didn't tick it");
    await pg.locator("#shopList .item", { hasText: "Mystery thing" }).locator("button.x").click();
    await pause(80);
    assert.equal(await pg.locator('#shopList .group:has(h2:text("Other"))').count(), 0, "empty aisle hidden");
    await pg.reload();
    await pg.waitForSelector("#days .day", { state: "attached" });
    await pg.click("#t-shop");
    assert.equal(
      await pg.locator('#shopList .group:has(h2:text("Pantry")) .item', { hasText: "tortillas" }).count(),
      1,
      "override survives reload",
    );
    assert.deepEqual(errors, []);
    await ctx.close();
  },
  "shop: groups have space between them": async (browser, url) => {
    const { pg, ctx } = await open(browser, url);
    await pg.locator("#days .day").first().click();
    await pg.locator("#pickList button[data-meal]", { hasText: "Beef mince tacos" }).click();
    await pg.click("#t-shop");
    const gap = await pg.evaluate(() => {
      const g = document.querySelectorAll("#shopList .group");
      return g[1].getBoundingClientRect().top - g[0].getBoundingClientRect().bottom;
    });
    assert.ok(gap >= 20, `gap between groups is ${gap}px`);
    await ctx.close();
  },
};

export const mealsTests = {
  "meals: search filters by name or ingredient": async (browser, url) => {
    const { pg, ctx, errors } = await open(browser, url);
    await pg.locator("#days .day").last().click();
    await pg.locator("#pickList button[data-meal]", { hasText: "Gyozas" }).click();
    await pg.click("#t-meals");
    assert.equal(await pg.locator("#mealList .meal").count(), 8);
    assert.match(
      await pg.locator("#mealList .meal", { hasText: "Gyozas" }).locator(".uses").textContent(),
      /^(Tonight|Planned Thu)$/,
      "short labels",
    );
    await pg.fill("#mealQ", "mince");
    const names = await pg.locator("#mealList .meal h3").allTextContents();
    assert.deepEqual(names, ["Beef mince and sweet potato bowl", "Beef mince tacos", "Gyozas", "Spaghetti bolognese"]);
    assert.match(
      await pg.locator("#mealList .meal", { hasText: "Gyozas" }).locator(".uses").textContent(),
      /Has pork mince/,
    );
    await pg.fill("#mealQ", "zzz");
    assert.equal(await pg.locator("#mealList .meal").count(), 0);
    assert.equal(await pg.textContent("#mealList .nores"), "+ Add “zzz”");
    await pg.fill("#mealQ", "");
    await pg.evaluate(() => scrollTo(0, 600));
    await pause(50);
    const header = await box(pg.locator("header"));
    const bar = await box(pg.locator(".bar"));
    assert.ok(Math.abs(bar.top - header.bottom) <= 1, `search stays under the header (${bar.top} vs ${header.bottom})`);
    await pg.fill("#mealQ", "zzz");
    await pg.click("#mealList .nores");
    assert.equal(await pg.inputValue("#mName"), "zzz", "search text becomes the new meal's name");
    await pg.click("#mealForm button[type=submit]");
    await pause(150);
    assert.equal(await pg.inputValue("#mealQ"), "", "search cleared so the new meal is visible");
    assert.equal(await pg.locator("#mealList .meal", { hasText: "zzz" }).count(), 1);
    assert.deepEqual(errors, []);
    await ctx.close();
  },
};
