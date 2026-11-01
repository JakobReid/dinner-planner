import { DAYS, DAY_FULL, addDays, fmt, parse, thisWeek, todayStr } from "../dates.js";
import { $, el, outIcon, toast } from "../dom.js";
import { state, viewWeek, setViewWeek, wk, mealById, fillEmptyNights, clearWeek } from "../state.js";
import { onRender, render } from "../render.js";
import { openPicker } from "./picker.js";
import { showTab } from "./tabs.js";

function weekDiff() {
  return Math.round((parse(viewWeek) - parse(thisWeek())) / (7 * 864e5));
}
function goWeek(k) {
  setViewWeek(k);
  render();
}

function renderNav() {
  const diff = weekDiff();
  $("wkLabel").textContent =
    diff === 0
      ? "This week"
      : diff === 1
        ? "Next week"
        : diff === -1
          ? "Last week"
          : diff > 0
            ? `In ${diff} weeks`
            : `${-diff} weeks ago`;
  const sub = $("sub");
  sub.replaceChildren(`${fmt(viewWeek)} to ${fmt(addDays(viewWeek, 6))}`);
  if (diff !== 0) sub.append(" ", el("button", { onclick: () => goWeek(thisWeek()) }, "Back to this week"));
  $("clearWk").textContent = diff === 0 ? "Clear this week" : "Clear this week’s plan";
}

function renderWeek({ flash } = {}) {
  const box = $("days");
  box.replaceChildren();
  const plan = wk().plan;
  const today = todayStr();
  DAYS.forEach((d, i) => {
    const date = addDays(viewWeek, i);
    const v = plan[d];
    const m = v && v !== "out" ? mealById(v) : null;
    let main;
    if (v === "out") main = el("span", { class: "m out" }, outIcon(), "Eating out / leftovers");
    else if (m)
      main = el(
        "span",
        { class: "m" },
        m.name,
        el(
          "span",
          { class: "i" },
          m.ingredients
            .filter((x) => !x.optional)
            .map((x) => x.name)
            .join(", "),
        ),
      );
    else main = el("span", { class: "m empty" }, date < today ? "Nothing recorded" : "Pick a dinner");
    const cls =
      "day" +
      (date === today ? " today" : "") +
      (date < today ? " past" : "") +
      (flash && flash.includes(i) ? " flash" : "");
    const label = `${DAY_FULL[i]} ${fmt(date)}: ${m ? m.name : v === "out" ? "eating out" : "nothing picked"}`;
    box.append(
      el(
        "button",
        { class: cls, onclick: () => openPicker(d), "aria-label": label },
        el("span", { class: "d" }, d, el("small", {}, parse(date).getDate())),
        main,
      ),
    );
  });
}

export function initWeek() {
  onRender(renderNav);
  onRender(renderWeek);
  $("prevWk").onclick = () => goWeek(addDays(viewWeek, -7));
  $("nextWk").onclick = () => goWeek(addDays(viewWeek, 7));
  $("toShop").onclick = () => showTab("shop");
  $("fill").onclick = () => {
    if (!state.meals.length) return toast("Add some meals first.");
    const { empty, filled } = fillEmptyNights();
    if (!empty.length) return toast("Every night’s sorted already.");
    render({ flash: filled });
  };
  $("clearWk").onclick = () => {
    if (!confirm(`Clear the dinners and shopping list for ${fmt(viewWeek)} to ${fmt(addDays(viewWeek, 6))}?`)) return;
    clearWeek(viewWeek);
    render();
  };
}
