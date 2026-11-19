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
    const clipped = [...document.querySelectorAll("h1,h2,h3,button,label,.m,.d,.chip,.ings")]
      .filter((e) => {
        const cs = getComputedStyle(e);
        return e.scrollWidth > e.clientWidth + 1 && cs.overflow !== "visible" && cs.textOverflow !== "ellipsis";
      })
      .map((e) => e.tagName + "." + e.className);
    // every control is a 44px target; the small pills count their invisible padding (::after)
    const small = [...scope.querySelectorAll("button,select,summary,input,.optl")]
      .filter((e) => {
        if (e.closest(".optl") && e.tagName === "INPUT") return false; // the pill is the target
        if (e.type === "checkbox" && e.labels.length) e = e.labels[0]; // the label row is the target
        const b = e.getBoundingClientRect();
        const grow = e.matches(".have,.tag") ? 12 : 0;
        return b.width > 0 && b.height > 0 && (b.height + grow < 44 || b.width < 44);
      })
      .map((e) => e.tagName + "#" + e.id + "." + e.className);
    // nothing a sheet needs is cut off by its edge, and nothing on the page hides behind the tab bar
    const foot = dlg && dlg.querySelector(".sheet-foot");
    const cut = foot
      ? [...foot.querySelectorAll("button")]
          .filter((e) => {
            const b = e.getBoundingClientRect();
            return b.bottom > innerHeight || b.top < dlg.getBoundingClientRect().top || b.right > vw || b.left < 0;
          })
          .map((e) => e.textContent)
      : [];
    const r = dlg && dlg.getBoundingClientRect();
    return {
      overflow: document.documentElement.scrollWidth > vw,
      wide,
      clipped,
      small,
      cut,
      dialogFits: r ? r.left >= 0 && r.right <= vw && r.bottom <= innerHeight : true,
    };
  });
}
const clean = (r, label) => {
  assert.equal(r.overflow, false, label + ": horizontal overflow");
  assert.deepEqual(r.wide, [], label + ": elements past the edge");
  assert.deepEqual(r.clipped, [], label + ": clipped text");
  assert.deepEqual(r.small, [], label + ": tap targets under 44px");
  assert.deepEqual(r.cut, [], label + ": sheet actions cut off");
  assert.ok(r.dialogFits, label + ": dialog outside viewport");
};

// With the page scrolled to its end, the last control sits above the tab bar.
async function clearOfTabs(pg, sel, label) {
  // twice: the first scroll collapses the title, which changes the page's height
  for (let i = 0; i < 2; i++) {
    await pg.evaluate(() => scrollTo(0, document.documentElement.scrollHeight));
    await pause(120);
  }
  const [b, bar] = await pg.evaluate(
    (q) => [
      document.querySelector(q).getBoundingClientRect().bottom,
      document.querySelector(".tabbar").getBoundingClientRect().top,
    ],
    sel,
  );
  assert.ok(b <= bar, `${label}: ${sel} hidden behind the tab bar`);
  await pg.evaluate(() => scrollTo(0, 0));
}

export const tests = {};
for (const w of [320, 375, 390]) {
  tests[`mobile: every screen fits at ${w}px`] = async (browser, url) => {
    const { pg, ctx, errors } = await open(browser, url, { viewport: { width: w, height: 667 } });
    const settle = () => pause(320); // sheets slide in
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
    await pg.locator("#pickChips button", { hasText: "Eating out" }).click();
    clean(await audit(pg), `${w} week`);
    await clearOfTabs(pg, "#spinBtn", `${w} week`);
    const bar = await pg.evaluate(() => {
      const r = document.querySelector(".tabbar").getBoundingClientRect();
      return [r.bottom, innerHeight];
    });
    assert.equal(bar[0], bar[1], "tab bar fixed to the foot of the screen");
    await pg.click("#nextWk");
    clean(await audit(pg), `${w} week (next, with back link)`);
    await pg.click("#spinBtn");
    await pg.waitForSelector("#spinReel.landed");
    clean(await audit(pg), `${w} spin`);
    await pg.locator("#spinDlg [data-close]").click();
    await pg.click("#prevWk");
    await pg.click("#t-meals");
    clean(await audit(pg), `${w} meals`);
    await pg.click("#t-shop");
    await pg.fill("#extraIn", "Bin bags");
    await pg.press("#extraIn", "Enter");
    await pg.locator("#shopList .item input").first().click();
    await pg.locator("#shopList .item .have").first().click();
    await pause(60);
    clean(await audit(pg), `${w} shop`);
    await clearOfTabs(pg, "#fold-have summary", `${w} shop`);
    await pg.click("#aisleMode");
    clean(await audit(pg), `${w} shop, edit aisles`);
    const chip = await pg.evaluate(() => {
      const s = document.querySelector(".group:nth-of-type(2) select.aisle");
      return s ? [s.offsetWidth, s.scrollWidth] : [1, 0];
    });
    assert.ok(chip[0] >= chip[1], `${w} aisle chip truncates`);
    await pg.click("#aisleMode");
    await pg.click("#t-week");
    await pg.locator("#days .day").nth(1).click();
    await settle();
    clean(await audit(pg), `${w} dinner view`);
    await pg.click("#vEdit");
    await settle();
    clean(await audit(pg), `${w} editor`);
    await pg.click("#mDel");
    await settle();
    clean(await audit(pg), `${w} confirm`);
    await pg.locator("#confirmDlg [data-close]").click();
    await pg.locator("#mealDlg [data-close]").click();
    await pg.locator("#days .day").nth(4).click();
    await settle();
    clean(await audit(pg), `${w} picker`);
    await pg.locator("#pickDlg [data-close]").click();
    await pg.click("#acctBtn");
    await settle();
    clean(await audit(pg), `${w} account`);
    assert.deepEqual(errors, []);
    await ctx.close();
  };
}
