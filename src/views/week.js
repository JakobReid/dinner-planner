import { DAYS, DAY_FULL, addDays, fmt, parse, thisWeek, todayStr } from "../dates.js";
import { $, el, leftoversIcon, moreIcon, nextIcon, outIcon, plusIcon, prevIcon, toast } from "../dom.js";
import {
  SPECIAL,
  viewWeek,
  setViewWeek,
  setViewTime,
  setViewWho,
  state,
  mealById,
  curTime,
  curWho,
  curPlan,
  canEdit,
  isMain,
  people,
  labelOf,
  clearWeek,
  restoreWeek,
  swapNights,
  fillSource,
  fillDays,
  fillEmptyDays,
  undoFill,
} from "../state.js";
import { onRender, render } from "../render.js";
import { openPicker } from "./picker.js";
import { openView } from "./view.js";
import { initDrag } from "./drag.js";
import { canInvite, goSettings } from "./lists.js";

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

// People go by their first name on a chip, unless two of them share it.
export function chipNames() {
  const list = people();
  const first = (p) => p.name.split(/\s+/)[0];
  return list.map((p) => ({
    ...p,
    short: list.some((o) => o !== p && first(o) === first(p)) ? p.name : first(p),
  }));
}

// One text tab per meal time, and for a meal time everyone plans for themselves, a chip per person.
function renderTimes() {
  const cur = curTime();
  $("timeTabs").replaceChildren(
    ...state.mealTimes.map((t) =>
      el(
        "button",
        {
          type: "button",
          "aria-pressed": String(t === cur),
          "data-time": t.id,
          onclick: () => {
            setViewTime(t.id);
            menu(false);
            render();
          },
        },
        t.name,
      ),
    ),
  );
  const on = $("timeTabs").querySelector('[aria-pressed="true"]');
  if (on) on.scrollIntoView({ block: "nearest", inline: "nearest" });

  const chips = $("whoChips");
  chips.hidden = !cur.each;
  if (!cur.each) return chips.replaceChildren();
  const who = curWho();
  const invite = canInvite()
    ? el(
        "button",
        {
          type: "button",
          class: "chipbtn addwho",
          "aria-label": "Invite someone in Settings",
          onclick: () => goSettings("peopleHead"),
        },
        plusIcon(),
      )
    : null;
  chips.replaceChildren(
    ...chipNames().map((p) =>
      el(
        "button",
        {
          type: "button",
          class: "chipbtn" + (p.id === who ? " cur" : ""),
          "aria-pressed": String(p.id === who),
          "data-who": p.id,
          onclick: () => {
            setViewWho(p.id);
            menu(false);
            render();
          },
        },
        p.short,
      ),
    ),
    ...(invite ? [invite] : []),
  );
}

function renderWeek({ flash } = {}) {
  const box = $("days");
  box.replaceChildren();
  const plan = curPlan();
  const today = todayStr();
  const cur = curTime();
  const mine = canEdit();
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
    const plan1 = isMain() ? "plan a dinner" : `plan ${cur.name.toLowerCase()}`;
    const what = m
      ? m.name
      : SPECIAL[v]
        ? SPECIAL[v].toLowerCase()
        : mine
          ? `nothing planned, ${plan1}`
          : "nothing planned";
    // someone else's plan is theirs to change: a meal can still be opened to see what's in it
    const act = mine
      ? () => (m ? openView(m.id, d) : openPicker(d))
      : m
        ? () => openView(m.id, d, { locked: true })
        : null;
    box.append(
      el(
        "button",
        {
          class: cls,
          ...(act ? { onclick: act } : { disabled: "" }),
          "aria-label": `${DAY_FULL[i]} ${fmt(date)}: ${what}`,
          "data-day": d,
          ...(v && mine ? { "data-has": "" } : {}),
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

  const them = mine ? null : people().find((p) => p.id === curWho());
  $("whoNote").hidden = mine;
  $("whoNote").textContent = them ? `Only ${them.name} can change these.` : "";
  $("weekActions").hidden = !mine;
  // filling is for meals you plan yourself and repeat: hidden when there's nothing to copy
  const fill = cur.each && mine && fillDays().length > 0;
  $("fillBtn").hidden = !fill;
  if (fill) $("fillBtn").replaceChildren(plusIcon(), `Fill empty days with ${labelOf(fillSource())}`);
}

// The overflow menu beside Spin the wheel. Clearing is undone from the toast rather than confirmed.
function menu(open) {
  $("weekMenu").hidden = !open;
  $("weekMore").setAttribute("aria-expanded", String(open));
}
// Whatever is on screen: undo only acts if you're still looking at the plan it changed.
const showing = () => [viewWeek, curTime().id, curWho()].join("|");

function clear() {
  menu(false);
  const key = viewWeek;
  const was = clearWeek(key);
  if (!was) return toast("Nothing to clear this week.");
  render();
  toast(
    isMain()
      ? "Cleared the week’s dinners and shopping list."
      : `Cleared ${curTime().name.toLowerCase()} for the week.`,
    {
      label: "Undo",
      fn: () => {
        restoreWeek(key, was);
        render();
      },
    },
  );
}

function fill() {
  const done = fillEmptyDays();
  if (!done) return;
  render({ flash: done.days.map((d) => DAYS.indexOf(d)) });
  toast(done.days.length === 1 ? "Filled 1 day." : `Filled ${done.days.length} days.`, {
    label: "Undo",
    fn: () => {
      undoFill(done);
      render();
    },
  });
}

// Dragging one night onto another swaps them, or moves a dinner to an empty night.
function drop(from, to) {
  if (!canEdit()) return;
  const moved = !curPlan()[to];
  const key = showing();
  if (!swapNights(from, to)) return;
  render({ flash: [DAYS.indexOf(from), DAYS.indexOf(to)] });
  toast(moved ? `Moved to ${to}.` : `Swapped ${from} and ${to}.`, {
    label: "Undo",
    fn: () => {
      if (showing() !== key) return;
      swapNights(from, to);
      render();
    },
  });
}

export function initWeek() {
  onRender(renderNav);
  onRender(renderTimes);
  onRender(renderWeek);
  initDrag($("days"), drop);
  $("prevWk").append(prevIcon());
  $("nextWk").append(nextIcon());
  $("weekMore").append(moreIcon());
  $("timeAdd").append(plusIcon());
  $("timeAdd").onclick = () => goSettings("timesHead");
  $("fillBtn").onclick = fill;
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
