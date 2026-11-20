// A planned dinner, read-only: the meal's name as the title, the night underneath, then what
// goes in it. From here you can change the dinner, edit the meal or take it off the night.
// Someone else's meal opens `locked`: you can read it, but changing their plan is up to them.
import { DAYS, DAY_FULL, addDays, fmt } from "../dates.js";
import { $, el } from "../dom.js";
import { viewWeek, mealById, setNight, curTime, curWho, isMain, people } from "../state.js";
import { render } from "../render.js";
import { openDialog, closeDialog } from "../dialogs.js";
import { openMeal } from "./editor.js";
import { openPicker } from "./picker.js";

let day = null;
let mealId = null;

export function openView(id, d, { locked = false } = {}) {
  const m = mealById(id);
  if (!m) return;
  day = d;
  mealId = id;
  const i = DAYS.indexOf(d);
  $("viewTitle").textContent = m.name;
  const t = curTime();
  const whose = t.each ? people().find((p) => p.id === curWho()) : null;
  $("viewSub").textContent = [
    `${DAY_FULL[i]} ${fmt(addDays(viewWeek, i))}`,
    isMain() && !whose ? "" : t.name,
    whose && whose.name.split(/\s+/)[0],
  ]
    .filter(Boolean)
    .join(" · ");
  $("vChange").hidden = locked;
  $("vChange").textContent = isMain() ? "Change dinner" : "Change meal";
  $("viewBody").replaceChildren(
    m.ingredients.length
      ? el(
          "ul",
          { class: "vlist" },
          m.ingredients.map((x) => el("li", {}, x.name, x.optional ? el("small", {}, "optional") : null)),
        )
      : el("p", { class: "muted" }, "No ingredients listed."),
    m.notes ? el("p", { class: "vnotes" }, m.notes) : null,
    locked
      ? null
      : el(
          "button",
          {
            class: "btn danger",
            id: "vRemove",
            onclick: () => {
              setNight(day, null);
              closeDialog("viewDlg");
              render();
            },
          },
          isMain() ? "Remove from this night" : "Clear day",
        ),
  );
  openDialog("viewDlg");
}

export function initView() {
  $("vChange").onclick = () => {
    closeDialog("viewDlg");
    openPicker(day);
  };
  $("vEdit").onclick = () => {
    closeDialog("viewDlg");
    openMeal(mealId);
  };
}
