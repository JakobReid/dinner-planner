import { fmt, todayStr } from "../dates.js";
import { $, el } from "../dom.js";
import { state, wk, lastHad, matchMeals } from "../state.js";
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
  const raw = $("mealQ").value.trim();
  const list = matchMeals(raw);
  if (!list.length) box.append(el("p", { class: "nores" }, `No meals match “${raw}”.`));
  list.forEach(({ m, hit }) => {
    const bits = [];
    if (counts[m.id])
      bits.push(counts[m.id] === 1 ? "In the week you’re viewing" : `In the week you’re viewing ×${counts[m.id]}`);
    if (last[m.id]) bits.push(last[m.id] === today ? "Having it tonight" : `Last had ${fmt(last[m.id])}`);
    if (hit) bits.unshift("Has " + hit.join(", "));
    box.append(
      el(
        "button",
        { class: "meal", onclick: () => openMeal(m.id) },
        el("h3", {}, m.name),
        m.ingredients.length
          ? el(
              "p",
              { class: "ings" },
              m.ingredients.flatMap((x, i) => [
                i ? ", " : "",
                x.optional ? el("span", { class: "opt" }, `maybe ${x.name}`) : x.name,
              ]),
            )
          : null,
        bits.length ? el("div", { class: "uses" }, bits.join(". ")) : null,
      ),
    );
  });
}

export function initMeals() {
  onRender(renderMeals);
  // a search that found nothing is probably the name of the meal you're about to add
  $("addMeal").onclick = () =>
    openMeal(null, { prefill: $("mealQ").value.trim(), onDone: () => ($("mealQ").value = "") });
  $("mealQ").oninput = renderMeals;
}
