import { fmt, todayStr } from "../dates.js";
import { $, el } from "../dom.js";
import { state, wk, lastHad } from "../state.js";
import { onRender } from "../render.js";
import { openMeal } from "./editor.js";

function renderMeals() {
  const box = $("mealList");
  box.replaceChildren();
  if (!state.meals.length) {
    box.append(el("div", { class: "empty-state" }, "No meals yet. Add the dinners you make most often."));
    return;
  }
  const counts = {};
  Object.values(wk().plan).forEach((id) => (counts[id] = (counts[id] || 0) + 1));
  const last = lastHad();
  const today = todayStr();
  [...state.meals]
    .sort((a, b) => a.name.localeCompare(b.name))
    .forEach((m) => {
      const bits = [];
      if (counts[m.id])
        bits.push(counts[m.id] === 1 ? "In the week you’re viewing" : `In the week you’re viewing ×${counts[m.id]}`);
      if (last[m.id]) bits.push(last[m.id] === today ? "Having it tonight" : `Last had ${fmt(last[m.id])}`);
      box.append(
        el(
          "button",
          { class: "meal", onclick: () => openMeal(m.id) },
          el("h3", {}, m.name),
          el(
            "div",
            { class: "chips" },
            m.ingredients.map((x) =>
              el("span", { class: "chip" + (x.optional ? " opt" : "") }, x.optional ? `maybe ${x.name}` : x.name),
            ),
          ),
          bits.length ? el("div", { class: "uses" }, bits.join(". ")) : null,
        ),
      );
    });
}

export function initMeals() {
  onRender(renderMeals);
  $("addMeal").onclick = () => openMeal(null);
}
