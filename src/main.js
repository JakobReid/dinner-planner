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

initDialogs();
initWeek(); // registration order is render order: nav, week, meals, shop
initMeals();
initShop();
initPicker();
initEditor();
initSettings();
initSpin();
render();
initTabs();
// Firebase is the bulk of the bundle; load it after first paint
import("./sync.js").then((m) => m.initSync());
