// "Pick a dinner" sheet for one night: Eating out and Leftovers as chips at the top, a search,
// and the meals. A new meal can be added without leaving, and it is picked for the night.
// It picks for whichever meal time and person the Week tab is showing, and says which under the date.
import { DAYS, DAY_FULL, addDays, fmt } from "../dates.js";
import { $, el, outIcon, leftoversIcon } from "../dom.js";
import { viewWeek, curPlan, curTime, curWho, isMain, people, setNight, matchMeals } from "../state.js";
import { render } from "../render.js";
import { openDialog, closeDialog } from "../dialogs.js";
import { openMeal } from "./editor.js";

let pickDay = null;

export function openPicker(d) {
  pickDay = d;
  const i = DAYS.indexOf(d);
  $("pickTitle").textContent = `${DAY_FULL[i]} ${fmt(addDays(viewWeek, i))}`;
  // dinner needs no introduction; anything else names the meal time, and whose it is
  const t = curTime();
  const whose = t.each ? people().find((p) => p.id === curWho()) : null;
  $("pickSub").hidden = isMain() && !whose;
  $("pickSub").textContent = [t.name, whose && whose.name.split(/\s+/)[0]].filter(Boolean).join(" · ");
  $("pickQ").value = "";
  renderPick();
  openDialog("pickDlg");
  if (matchMedia("(pointer:fine)").matches) $("pickQ").focus();
  else $("pickQ").blur();
}

function setDay(d, v) {
  setNight(d, v);
  closeDialog("pickDlg");
  render({ flash: [DAYS.indexOf(d)] });
}
const addNew = (name) => openMeal(null, { prefill: name, onDone: (id) => id && setDay(pickDay, id) });

function renderPick() {
  const d = pickDay;
  const plan = curPlan();
  const cur = plan[d];
  const dinner = isMain();
  const chip = (key, icon, label) =>
    el(
      "button",
      { class: "chipbtn" + (cur === key ? " cur" : ""), "data-night": key, onclick: () => setDay(d, key) },
      icon,
      label,
    );
  $("pickChips").replaceChildren(
    chip("out", outIcon(), "Eating out"),
    chip("leftovers", leftoversIcon(), "Leftovers"),
    cur
      ? el(
          "button",
          { class: "chipbtn remove", id: "pickRemove", onclick: () => setDay(d, null) },
          dinner ? "Remove from this night" : "Clear day",
        )
      : "",
  );

  const box = $("pickList");
  box.replaceChildren();
  const elsewhere = new Set(
    Object.entries(plan)
      .filter(([k]) => k !== d)
      .map(([, v]) => v),
  );
  const raw = $("pickQ").value.trim();
  const list = matchMeals(raw);
  list.forEach(({ m, hit }) => {
    const notes = [];
    if (hit) notes.push("Has " + hit.join(", "));
    if (m.id === cur) notes.push(dinner ? "Planned for this night" : "Planned for this day");
    else if (elsewhere.has(m.id)) notes.push(dinner ? "Planned another night" : "Planned another day");
    box.append(
      el(
        "button",
        { class: m.id === cur ? "cur" : "", "data-meal": m.id, onclick: () => setDay(d, m.id) },
        m.name,
        notes.length ? el("small", {}, notes.join(" · ")) : null,
      ),
    );
  });
  if (!list.length)
    box.append(
      raw
        ? el("button", { class: "btn ghost nores", onclick: () => addNew(raw) }, `+ Add “${raw}”`)
        : el("p", { class: "muted" }, "No meals yet. Add one with New meal."),
    );
}

export function initPicker() {
  $("pickNew").onclick = () => addNew("");
  $("pickQ").addEventListener("input", renderPick);
  $("pickQ").addEventListener("keydown", (e) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    const b = $("pickList").querySelector("button[data-meal]");
    if (b && $("pickQ").value.trim()) b.click();
  });
}
