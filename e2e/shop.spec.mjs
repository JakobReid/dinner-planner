import { open, assert, pause } from "./lib.mjs";

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
    assert.equal(await pg.locator("#shopList .item.maybe").count(), 2, "maybe rows");
    assert.equal(
      await pg.locator('#shopList .group:has(h2:text("Household")) .item', { hasText: "Bin bags" }).count(),
      1,
    );
    assert.equal(
      await pg.locator('#shopList .group:has(h2:text("Other")) .item', { hasText: "Mystery thing" }).count(),
      1,
    );
    const badge = Number(await pg.textContent("#shopCount"));
    await pg.locator("#shopList .item", { hasText: "tortillas" }).locator("select.aisle").selectOption("pantry");
    await pause(100);
    assert.equal(
      await pg.locator('#shopList .group:has(h2:text("Pantry")) .item', { hasText: "tortillas" }).count(),
      1,
      "override moved it",
    );
    await pg.locator("#shopList .item", { hasText: "tortillas" }).locator("input").check();
    await pause(80);
    assert.equal(Number(await pg.textContent("#shopCount")), badge - 1, "badge drops on tick");
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
