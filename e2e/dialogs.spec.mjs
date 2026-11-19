import { open, assert, pause, box } from "./lib.mjs";

export const tests = {
  "sheets: page scroll is frozen underneath and restored after": async (browser, url) => {
    // a short screen, so the week is long enough to scroll
    const { pg, ctx } = await open(browser, url, { viewport: { width: 420, height: 380 } });
    await pg.evaluate(() => scrollTo(0, 150));
    await pause(50);
    await pg.locator("#days .day").last().click(); // Playwright may scroll further to reach it
    assert.equal(await pg.evaluate(() => document.body.style.position), "fixed");
    const top = await pg.evaluate(() => document.body.style.top);
    assert.match(top, /^-\d+px$/, "locked at the scroll position");
    await pg.mouse.move(200, 100);
    await pg.mouse.wheel(0, 500);
    await pause(100);
    assert.equal(await pg.evaluate(() => document.body.style.top), top, "page held in place");
    await pg.click("#pickNew");
    await pg.locator("#mealDlg [data-close]").click();
    assert.equal(await pg.evaluate(() => document.body.style.position), "fixed", "still locked under the picker");
    await pg.locator("#pickDlg [data-close]").click();
    await pause(100);
    assert.equal(await pg.evaluate(() => document.body.style.position), "");
    assert.equal(await pg.evaluate(() => scrollY), -parseInt(top), "scroll restored");
    await ctx.close();
  },
  "sheets: the editor's Save and Cancel stay on screen when the keyboard is up": async (browser, url) => {
    const { pg, ctx } = await open(browser, url, { viewport: { width: 390, height: 740 } });
    await pg.click("#t-meals");
    await pg.locator("#mealList .meal", { hasText: "Red Thai chicken curry" }).click(); // nine ingredients
    await pause(300);
    const visible = async (h, label) => {
      const sheet = await box(pg.locator("#mealDlg"));
      assert.ok(sheet.top >= 0 && sheet.bottom <= h, `${label}: sheet fits the visible area`);
      for (const sel of ["#mealDlg [data-close]", "#mealForm button[type=submit]"]) {
        const b = await box(pg.locator(sel));
        assert.ok(b.top >= sheet.top && b.bottom <= h, `${label}: ${sel} is on screen without scrolling`);
      }
    };
    await visible(740, "full height");
    assert.ok(
      await pg.evaluate(() => {
        const d = document.querySelector("#mealDlg .sheet-body");
        return d.scrollHeight > d.clientHeight;
      }),
      "the fields scroll, the footer doesn't",
    );
    await pg.setViewportSize({ width: 390, height: 380 });
    await pause(250);
    await visible(380, "keyboard up");
    await pg.fill("#mName", "Keyboard test");
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
  "sheets: sit at the foot of the screen and swipe down to dismiss": async (browser, url) => {
    const { pg, ctx } = await open(browser, url, { viewport: { width: 375, height: 667 } });
    await pg.locator("#days .day").first().click();
    await pause(350);
    const sheet = await box(pg.locator("#pickDlg"));
    assert.equal(sheet.bottom, 667, "anchored to the bottom edge");
    assert.ok(sheet.top >= 40, "some page still shows above it");
    const head = await pg.locator("#pickDlg .sheet-head").boundingBox();
    const x = head.x + head.width / 2;
    // a short drag springs back
    await pg.mouse.move(x, head.y + 10);
    await pg.mouse.down();
    await pg.mouse.move(x, head.y + 40, { steps: 3 });
    await pg.mouse.up();
    await pause(250);
    assert.equal(await pg.locator("#pickDlg[open]").count(), 1, "short drag keeps it open");
    assert.equal((await box(pg.locator("#pickDlg"))).bottom, 667, "and it settles back");
    await pg.mouse.move(x, head.y + 10);
    await pg.mouse.down();
    await pg.mouse.move(x, head.y + 180, { steps: 5 });
    await pg.mouse.up();
    await pause(150);
    assert.equal(await pg.locator("#pickDlg[open]").count(), 0, "a long drag down closes it");
    // a tap on the dimmed page closes a sheet too, but not the editor, which could lose typing
    await pg.locator("#days .day").first().click();
    await pause(300);
    await pg.mouse.click(180, 20);
    assert.equal(await pg.locator("#pickDlg[open]").count(), 0, "tap outside closes");
    await pg.click("#t-meals");
    await pg.click("#addMeal");
    await pause(300);
    await pg.mouse.click(180, 20);
    assert.equal(await pg.locator("#mealDlg[open]").count(), 1, "the editor stays");
    await ctx.close();
  },
  "toasts: full width above the tab bar, clear of the page's last controls": async (browser, url) => {
    const { pg, ctx } = await open(browser, url, { viewport: { width: 375, height: 667 } });
    await pg.locator("#days .day").first().click();
    await pg.locator("#pickList button[data-meal]").first().click();
    await pg.click("#weekMore");
    await pg.click("#clearWk");
    await pause(500);
    const toast = await box(pg.locator(".toast"));
    const bar = await box(pg.locator(".tabbar"));
    assert.ok(toast.bottom <= bar.top, "toast clears the tab bar");
    assert.ok(toast.right - toast.left >= 340, "full width");
    // the page nudges up if the toast would land on the last controls
    for (const sel of ["#spinBtn", "#weekMore"]) {
      const b = await box(pg.locator(sel));
      assert.ok(b.bottom <= toast.top, `${sel} is clear of the toast`);
    }
    await ctx.close();
  },
  "settings: theme lives on the profile tab, with System, Light and Dark": async (browser, url) => {
    const { pg, ctx } = await open(browser, url);
    const theme = () => pg.evaluate(() => document.documentElement.dataset.theme);
    assert.equal(await theme(), undefined, "light by default");
    await pg.click("#acctBtn");
    assert.deepEqual(await pg.locator("#themeSeg button").allTextContents(), ["System", "Light", "Dark"]);
    await pg.locator('#themeSeg button[data-theme="dark"]').click();
    assert.equal(await theme(), "dark");
    await pg.click("#t-week");
    await pg.reload();
    await pg.waitForSelector("#days .day");
    assert.equal(await theme(), "dark", "remembered");
    await pg.click("#acctBtn");
    await pg.locator('#themeSeg button[data-theme="system"]').click();
    assert.equal(await theme(), undefined, "system follows a light phone");
    await pg.emulateMedia({ colorScheme: "dark" });
    await pause(50);
    assert.equal(await theme(), "dark", "and a dark one, as it changes");
    await pg.reload();
    await pg.waitForSelector("#days .day", { state: "attached" }); // reloads onto the profile tab
    assert.equal(await theme(), "dark", "system is remembered too");
    await pg.click("#acctBtn");
    await pg.locator('#themeSeg button[data-theme="light"]').click();
    assert.equal(await theme(), undefined);
    await ctx.close();
  },
  "header: only the week, the same height on any week, and hidden on the profile tab": async (browser, url) => {
    const { pg, ctx } = await open(browser, url, { viewport: { width: 375, height: 500 } });
    // "Back to this week" has its space reserved, so the header is the same height on any week
    const height = () => pg.evaluate(() => document.querySelector("header").offsetHeight);
    const before = await height();
    await pg.click("#nextWk");
    assert.equal(await height(), before, "no layout shift when the back link appears");
    // on this week the label sits in the middle of the header, level with the arrows
    await pg.click("#wkNow");
    const mid = (q) =>
      pg
        .locator(q)
        .boundingBox()
        .then((b) => b.y + b.height / 2);
    const text = await pg.evaluate(() => {
      const a = document.getElementById("wkLabel").getBoundingClientRect();
      const b = document.getElementById("sub").getBoundingClientRect();
      return (a.top + b.bottom) / 2;
    });
    assert.ok(Math.abs(text - (await mid("#prevWk"))) < 2, "week label centred on the arrows");
    await pg.click("#t-profile");
    assert.equal(await pg.locator("header").isVisible(), false, "no week arrows on the profile tab");
    assert.equal(await pg.locator("h1").count(), 0, "the title row is gone");
    await pg.click("#t-shop");
    assert.equal(await pg.locator("header").isVisible(), true);
    // a full week with a two-line meal fits a small phone without scrolling
    await pg.click("#t-week");
    await pg.setViewportSize({ width: 375, height: 610 });
    await pg.locator("#days .day").first().click();
    await pg.locator("#pickList button[data-meal]", { hasText: "Beef mince and sweet potato bowl" }).click();
    await pause(150);
    const room = await pg.evaluate(() => {
      const foot = document.querySelector(".actions").getBoundingClientRect().bottom + scrollY;
      return {
        over: document.documentElement.scrollHeight - innerHeight,
        foot,
        bar: document.querySelector(".tabbar").getBoundingClientRect().top,
      };
    });
    assert.ok(room.over <= 0 && room.foot <= room.bar, `week fits 375x610: ${JSON.stringify(room)}`);
    await ctx.close();
  },
};
