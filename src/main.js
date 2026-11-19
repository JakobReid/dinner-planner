import "./styles.css";
import { initDialogs } from "./dialogs.js";
import { render } from "./render.js";
import { initTabs } from "./views/tabs.js";
import { initWeek } from "./views/week.js";
import { initMeals } from "./views/meals.js";
import { initShop } from "./views/shop.js";
import { initPicker } from "./views/picker.js";
import { initEditor } from "./views/editor.js";
import { initSettings } from "./views/settings.js";
import { initSpin } from "./views/spin.js";
import { initView } from "./views/view.js";
import { initAccount } from "./views/lists.js";

initDialogs();
initWeek(); // registration order is render order: nav, week, meals, shop
initMeals();
initShop();
initPicker();
initEditor();
initView();
initAccount();
initSettings();
initSpin();
render();
initTabs();
// Firebase is the bulk of the bundle; load it after first paint
import("./sync.js").then((m) => m.initSync());

// A tab left open, or one the browser restores from its own copy, keeps running the build it
// first loaded. Whenever the app comes back into view, check for a newer build and reload into it.
if (import.meta.env.PROD) {
  const mine = new URL(import.meta.url).pathname;
  const check = async () => {
    if (document.visibilityState !== "visible" || document.querySelector("dialog[open]")) return;
    try {
      const html = await (await fetch("/index.html", { cache: "no-store" })).text();
      const live = html.match(/src="(\/assets\/index-[^"]+\.js)"/)?.[1];
      // once per build, so a copy that refuses to update can't loop
      if (!live || live === mine || sessionStorage.getItem("reloadedFor") === live) return;
      sessionStorage.setItem("reloadedFor", live);
      location.reload();
    } catch {
      /* offline or storage off: carry on with this build */
    }
  };
  document.addEventListener("visibilitychange", check);
  window.addEventListener("pageshow", check);
}
