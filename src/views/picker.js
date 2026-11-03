// "Pick a dinner" dialog for one night: search meals, pick one, or add/edit a meal without leaving.
import { DAYS, DAY_FULL, addDays, fmt } from "../dates.js";
import { $, el, outIcon, clearIcon, plusIcon, editIcon } from "../dom.js";
import { viewWeek, wk, setNight, matchMeals } from "../state.js";
import { render } from "../render.js";
import { openDialog, closeDialog } from "../dialogs.js";
import { openMeal } from "./editor.js";

let pickDay = null;

export function openPicker(d) {
  pickDay = d;
  const i = DAYS.indexOf(d);
  $("pickTitle").textContent = `${DAY_FULL[i]} ${fmt(addDays(viewWeek, i))}`;
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

function renderPick() {
  const d = pickDay;
  const box = $("pickList");
  box.replaceChildren();
  const plan = wk().plan;
  const cur = plan[d];
  const used = new Set(
    Object.entries(plan)
      .filter(([k]) => k !== d)
      .map(([, v]) => v),
  );
  const raw = $("pickQ").value.trim();
  const q = raw.toLowerCase();
  const list = matchMeals(raw);
  list.forEach(({ m, hit }) => {
    const notes = [];
    if (hit) notes.push("Has " + hit.join(", "));
    if (used.has(m.id)) notes.push("Already on another night");
    box.append(
      el(
        "div",
        { class: "pr" },
        el(
          "button",
          { class: m.id === cur ? "cur" : "", "data-meal": m.id, onclick: () => setDay(d, m.id) },
          m.name,
          notes.length ? el("small", {}, notes.join(". ")) : null,
        ),
        el(
          "button",
          { class: "edit", "aria-label": `Edit ${m.name}`, onclick: () => openMeal(m.id, { onDone: renderPick }) },
          editIcon(),
        ),
      ),
    );
  });
  if (q && !list.length) box.append(el("p", { class: "nores" }, `No meals match “${raw}”.`));

  // actions sit under the list and stay visible however long it gets
  const acts = $("pickActs");
  acts.replaceChildren();
  const noMatch = q && !list.length;
  acts.append(
    el(
      "button",
      { class: "alt", onclick: () => openMeal(null, { prefill: noMatch ? raw : "", onDone: (id) => setDay(d, id) }) },
      plusIcon(),
      noMatch ? `Add “${raw}” as a new meal` : "Add a new meal",
    ),
  );
  acts.append(
    el(
      "button",
      { class: "alt" + (cur === "out" ? " cur" : ""), onclick: () => setDay(d, "out") },
      outIcon(),
      "Eating out / leftovers",
    ),
  );
  if (cur)
    acts.append(el("button", { class: "alt clear", onclick: () => setDay(d, null) }, clearIcon(), "Clear this night"));
}

export function initPicker() {
  $("pickQ").addEventListener("input", renderPick);
  $("pickQ").addEventListener("keydown", (e) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    const b = $("pickList").querySelector("button[data-meal]");
    if (b && $("pickQ").value.trim()) b.click();
  });
}
