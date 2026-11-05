import { DAYS, DAY_FULL, addDays, fmt, parse, thisWeek, todayStr } from "../dates.js";
import { $, el, leftoversIcon, outIcon } from "../dom.js";
import { SPECIAL, viewWeek, setViewWeek, wk, mealById, clearWeek } from "../state.js";
import { onRender, render } from "../render.js";
import { openPicker } from "./picker.js";
import { openMeal } from "./editor.js";

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
  $("clearWk").textContent = diff === 0 ? "Clear week" : "Clear this week";
}

function renderWeek({ flash } = {}) {
  const box = $("days");
  box.replaceChildren();
  const plan = wk().plan;
  const today = todayStr();
  DAYS.forEach((d, i) => {
    const date = addDays(viewWeek, i);
    const v = plan[d];
    const m = v && !SPECIAL[v] ? mealById(v) : null;
    let main;
    if (SPECIAL[v]) main = el("span", { class: "m out" }, v === "out" ? outIcon() : leftoversIcon(), SPECIAL[v]);
    else if (m) main = el("span", { class: "m" }, el("span", { class: "n" }, m.name));
    else main = el("span", { class: "m empty" }, date < today ? "" : "Pick a dinner");
    const cls =
      "day" +
      (date === today ? " today" : "") +
      (date < today ? " past" : "") +
      (flash && flash.includes(i) ? " flash" : "");
    const label = `${DAY_FULL[i]} ${fmt(date)}: ${m ? m.name : SPECIAL[v] ? SPECIAL[v].toLowerCase() : "nothing picked"}`;
    box.append(
      el(
        "button",
        {
          class: cls,
          onclick: () =>
            m
              ? openMeal(m.id, { view: { title: `${DAY_FULL[i]} ${fmt(date)}`, onChange: () => openPicker(d) } })
              : openPicker(d),
          "aria-label": label,
        },
        el(
          "span",
          { class: "row" },
          el("span", { class: "d" }, el("span", { class: "dn" }, d), el("small", {}, parse(date).getDate())),
          main,
        ),
      ),
    );
  });
}

export function initWeek() {
  onRender(renderNav);
  onRender(renderWeek);
  $("prevWk").onclick = () => goWeek(addDays(viewWeek, -7));
  $("nextWk").onclick = () => goWeek(addDays(viewWeek, 7));
  $("clearWk").onclick = () => {
    if (!confirm(`Clear the dinners and shopping list for ${fmt(viewWeek)} to ${fmt(addDays(viewWeek, 6))}?`)) return;
    clearWeek(viewWeek);
    render();
  };
}
