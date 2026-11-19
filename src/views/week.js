import { DAYS, DAY_FULL, addDays, fmt, parse, thisWeek, todayStr } from "../dates.js";
import { $, el, leftoversIcon, moreIcon, nextIcon, outIcon, prevIcon, toast } from "../dom.js";
import { SPECIAL, viewWeek, setViewWeek, state, wk, mealById, clearWeek, restoreWeek, swapNights } from "../state.js";
import { onRender, render } from "../render.js";
import { openPicker } from "./picker.js";
import { openView } from "./view.js";
import { initDrag } from "./drag.js";

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
  $("sub").textContent = `${fmt(viewWeek)} to ${fmt(addDays(viewWeek, 6))}`;
  // the label doubles as the way back; its "Back to this week" line keeps its space when hidden
  $("wkNow").disabled = diff === 0;
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
    else main = el("span", { class: "m empty" });
    const cls =
      "day" +
      (date === today ? " today" : "") +
      (date < today ? " past" : "") +
      (flash && flash.includes(i) ? " flash" : "");
    const what = m ? m.name : SPECIAL[v] ? SPECIAL[v].toLowerCase() : "nothing planned, plan a dinner";
    box.append(
      el(
        "button",
        {
          class: cls,
          onclick: () => (m ? openView(m.id, d) : openPicker(d)),
          "aria-label": `${DAY_FULL[i]} ${fmt(date)}: ${what}`,
          "data-day": d,
          ...(v ? { "data-has": "" } : {}),
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

// The overflow menu beside Spin the wheel. Clearing is undone from the toast rather than confirmed.
function menu(open) {
  $("weekMenu").hidden = !open;
  $("weekMore").setAttribute("aria-expanded", String(open));
}
function clear() {
  menu(false);
  const key = viewWeek;
  if (!state.weeks[key]) return toast("Nothing to clear this week.");
  const was = clearWeek(key);
  render();
  toast("Cleared the week’s dinners and shopping list.", {
    label: "Undo",
    fn: () => {
      restoreWeek(key, was);
      render();
    },
  });
}

// Dragging one night onto another swaps them, or moves a dinner to an empty night.
function drop(from, to) {
  const moved = !wk().plan[to];
  const key = viewWeek;
  if (!swapNights(from, to)) return;
  render({ flash: [DAYS.indexOf(from), DAYS.indexOf(to)] });
  toast(moved ? `Moved to ${to}.` : `Swapped ${from} and ${to}.`, {
    label: "Undo",
    fn: () => {
      if (viewWeek !== key) return;
      swapNights(from, to);
      render();
    },
  });
}

export function initWeek() {
  onRender(renderNav);
  onRender(renderWeek);
  initDrag($("days"), drop);
  $("prevWk").append(prevIcon());
  $("nextWk").append(nextIcon());
  $("weekMore").append(moreIcon());
  $("prevWk").onclick = () => goWeek(addDays(viewWeek, -7));
  $("nextWk").onclick = () => goWeek(addDays(viewWeek, 7));
  $("wkNow").onclick = () => goWeek(thisWeek());
  $("weekMore").onclick = () => menu($("weekMenu").hidden);
  $("clearWk").onclick = clear;
  document.addEventListener("click", (e) => {
    if (!e.target.closest(".more")) menu(false);
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") menu(false);
  });
}
