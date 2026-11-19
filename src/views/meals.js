import { DAYS, addDays, fmt, todayStr } from "../dates.js";
import { $, el } from "../dom.js";
import { state, viewWeek, wk, lastHad, matchMeals } from "../state.js";
import { onRender } from "../render.js";
import { openMeal } from "./editor.js";

const addNew = (name) => openMeal(null, { prefill: name, onDone: () => ($("mealQ").value = "") });

function renderMeals() {
  const box = $("mealList");
  box.replaceChildren();
  if (!state.meals.length) {
    box.append(el("div", { class: "empty-state" }, "No meals yet. Add the dinners you make most often."));
    return;
  }
  const plan = wk().plan;
  const last = lastHad();
  const today = todayStr();
  const raw = $("mealQ").value.trim();
  const list = matchMeals(raw);
  // a search that found nothing is probably the name of the meal you're about to add
  if (!list.length)
    box.append(el("button", { class: "btn ghost nores", onclick: () => addNew(raw) }, `+ Add “${raw}”`));
  list.forEach(({ m, hit }) => {
    // short labels: Tonight, Planned Sat, Last had 14 Nov
    const bits = [];
    if (hit) bits.push("Has " + hit.join(", "));
    const nights = DAYS.filter((d) => plan[d] === m.id);
    const tonight = nights.some((d) => addDays(viewWeek, DAYS.indexOf(d)) === today);
    const others = nights.filter((d) => addDays(viewWeek, DAYS.indexOf(d)) !== today);
    if (tonight) bits.push("Tonight");
    if (others.length) bits.push("Planned " + others.join(", "));
    if (last[m.id] && last[m.id] !== today) bits.push(`Last had ${fmt(last[m.id])}`);
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
                x.optional ? el("span", { class: "opt" }, `${x.name} (optional)`) : x.name,
              ]),
            )
          : null,
        bits.length ? el("div", { class: "uses" }, bits.join(" · ")) : null,
      ),
    );
  });
}

export function initMeals() {
  onRender(renderMeals);
  $("addMeal").onclick = () => addNew($("mealQ").value.trim());
  $("mealQ").oninput = renderMeals;
}
