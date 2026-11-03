import { open, assert, pause, box } from "./lib.mjs";

export const tests = {
  "dialogs: page scroll is frozen underneath and restored after": async (browser, url) => {
    const { pg, ctx } = await open(browser, url, { viewport: { width: 420, height: 600 } });
    await pg.evaluate(() => scrollTo(0, 250));
    await pause(50);
    await pg.locator("#days .day").last().click(); // Playwright may scroll further to reach it
    assert.equal(await pg.evaluate(() => document.body.style.position), "fixed");
    const top = await pg.evaluate(() => document.body.style.top);
    assert.match(top, /^-\d+px$/, "locked at the scroll position");
    await pg.mouse.move(200, 300);
    await pg.mouse.wheel(0, 500);
    await pause(100);
    assert.equal(await pg.evaluate(() => document.body.style.top), top, "page held in place");
    await pg.locator("#pickList button.edit").first().click();
    await pg.locator("#mealDlg [data-close]:visible").click();
    assert.equal(await pg.evaluate(() => document.body.style.position), "fixed", "still locked under the picker");
    await pg.locator("#pickDlg [data-close]").click();
    await pause(100);
    assert.equal(await pg.evaluate(() => document.body.style.position), "");
    assert.equal(await pg.evaluate(() => scrollY), -parseInt(top), "scroll restored");
    await ctx.close();
  },
  "dialogs: editor shrinks to the visible viewport when the keyboard is up": async (browser, url) => {
    const { pg, ctx } = await open(browser, url, { viewport: { width: 390, height: 740 } });
    await pg.click("#t-meals");
    await pg.click("#addMeal");
    await pause(100);
    await pg.setViewportSize({ width: 390, height: 380 });
    await pause(250);
    assert.ok((await box(pg.locator("#mealDlg"))).bottom <= 380, "dialog fits the visible area");
    assert.ok(
      await pg.evaluate(() => {
        const d = document.querySelector("#mealDlg .dlg");
        return d.scrollHeight > d.clientHeight;
      }),
      "panel scrolls",
    );
    await pg.fill("#mName", "Keyboard test");
    await pg.locator("#mealForm button[type=submit]").scrollIntoViewIfNeeded();
    const save = await box(pg.locator("#mealForm button[type=submit]"));
    assert.ok(save.top >= 0 && save.bottom <= 380, "save reachable");
    await pg.click("#mealForm button[type=submit]");
    await pause(150);
    assert.equal(await pg.locator("#mealList .meal", { hasText: "Keyboard test" }).count(), 1);
    assert.equal(
      await pg.evaluate(() => document.getElementById("mealDlg").style.maxHeight),
      "",
      "inline size reset on close",
    );
    await ctx.close();
  },
  "settings: dark theme toggles and sticks across a reload": async (browser, url) => {
    const { pg, ctx } = await open(browser, url);
    assert.equal(await pg.evaluate(() => document.documentElement.dataset.theme), undefined, "light by default");
    await pg.click("#settingsBtn");
    await pg.locator('#themeSeg button[data-theme="dark"]').click();
    assert.equal(await pg.evaluate(() => document.documentElement.dataset.theme), "dark");
    await pg.locator("#settingsDlg [data-close]").click();
    await pg.reload();
    await pg.waitForSelector("#days .day");
    assert.equal(await pg.evaluate(() => document.documentElement.dataset.theme), "dark", "remembered");
    await pg.click("#settingsBtn");
    await pg.locator('#themeSeg button[data-theme="light"]').click();
    assert.equal(await pg.evaluate(() => document.documentElement.dataset.theme), undefined);
    await ctx.close();
  },
};
