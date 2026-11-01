import { open, assert, pause } from "./lib.mjs";

// Every screen at three phone widths: no sideways overflow, no clipped text, tap targets of a sane size.
async function audit(pg) {
  return pg.evaluate(() => {
    const vw = document.documentElement.clientWidth;
    const dlg = document.querySelector("dialog[open]");
    const scope = dlg || document;
    const wide = [...document.querySelectorAll("body *")]
      .filter((e) => {
        const b = e.getBoundingClientRect();
        return b.width > 0 && (b.right > vw + 1 || b.left < -1) && !e.closest("dialog");
      })
      .map((e) => e.tagName + "#" + e.id + "." + e.className);
    const clipped = [...document.querySelectorAll("h1,h2,h3,button,label,.m,.d,.chip,.from")]
      .filter((e) => {
        const cs = getComputedStyle(e);
        return e.scrollWidth > e.clientWidth + 1 && cs.overflow !== "visible" && cs.textOverflow !== "ellipsis";
      })
      .map((e) => e.tagName + "." + e.className);
    const small = [...scope.querySelectorAll("button,select")]
      .filter((e) => {
        const b = e.getBoundingClientRect();
        return b.width > 0 && b.height > 0 && (b.height < 28 || b.width < 28);
      })
      .map((e) => e.tagName + "." + e.className);
    const r = dlg && dlg.getBoundingClientRect();
    return {
      overflow: document.documentElement.scrollWidth > vw,
      wide,
      clipped,
      small,
      dialogFits: r ? r.left >= 0 && r.right <= vw && r.bottom <= innerHeight : true,
    };
  });
}
const clean = (r, label) => {
  assert.equal(r.overflow, false, label + ": horizontal overflow");
  assert.deepEqual(r.wide, [], label + ": elements past the edge");
  assert.deepEqual(r.clipped, [], label + ": clipped text");
  assert.deepEqual(r.small, [], label + ": tiny tap targets");
  assert.ok(r.dialogFits, label + ": dialog outside viewport");
};

export const tests = {};
for (const w of [320, 360, 390]) {
  tests[`mobile: every screen fits at ${w}px`] = async (browser, url) => {
    const { pg, ctx, errors } = await open(browser, url, { viewport: { width: w, height: 740 } });
    for (const [n, name] of [
      [0, "Beef mince and sweet potato bowl"],
      [1, "Rice cooker chicken"],
      [3, "Red Thai chicken curry"],
    ]) {
      await pg.locator("#days .day").nth(n).click();
      await pg.locator("#pickList button[data-meal]", { hasText: name }).click();
      await pause(60);
    }
    await pg.locator("#days .day").nth(2).click();
    await pg.locator("#pickActs button.alt", { hasText: "Eating out" }).click();
    await pg.click("#nextWk");
    clean(await audit(pg), `${w} week (next, with back link)`);
    await pg.click("#prevWk");
    await pg.click("#t-meals");
    clean(await audit(pg), `${w} meals`);
    await pg.click("#t-shop");
    await pg.fill("#extraIn", "Bin bags");
    await pg.press("#extraIn", "Enter");
    await pause(60);
    clean(await audit(pg), `${w} shop`);
    const chip = await pg.evaluate(() => {
      const s = document.querySelector(".group:nth-of-type(2) select.aisle");
      return s ? [s.offsetWidth, s.scrollWidth] : [1, 0];
    });
    assert.ok(chip[0] >= chip[1], `${w} aisle chip truncates`);
    await pg.click("#t-week");
    await pg.locator("#days .day").nth(1).click();
    await pause(100);
    clean(await audit(pg), `${w} picker`);
    await pg.locator("#pickList button.edit").first().click();
    await pause(100);
    clean(await audit(pg), `${w} editor`);
    assert.deepEqual(errors, []);
    await ctx.close();
  };
}
