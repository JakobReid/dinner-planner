// Add / edit meal sheet. Ingredients are one row each with an Optional toggle.
// `onDone(id)` fires after a save (new or existing id) or a delete (null).
import { $, el } from "../dom.js";
import { mealById, ing, maybeLast, upsertMeal, deleteMeal } from "../state.js";
import { render } from "../render.js";
import { openDialog, closeDialog, confirmSheet } from "../dialogs.js";

let editing = null;
let onDone = null;

const rows = () => [...$("mIngRows").children];
const nameOf = (row) => row.querySelector(".ing");

// One ingredient row. Typing in the last row adds a fresh one under it, so there is always
// somewhere to put the next ingredient.
function addRow(name = "", optional = false) {
  const input = el("input", { class: "ing", "aria-label": "Ingredient", autocomplete: "off", enterkeyhint: "next" });
  input.value = name;
  const box = el("input", { type: "checkbox", "aria-label": "Optional" });
  box.checked = optional;
  const row = el("div", { class: "ingrow" }, input, el("label", { class: "optl" }, box, "Optional"));
  input.addEventListener("input", () => {
    if (row === rows().at(-1) && input.value.trim()) addRow();
  });
  input.addEventListener("keydown", (e) => {
    if (e.key !== "Enter") return;
    e.preventDefault(); // Enter moves down a row; it doesn't save the meal
    const next = row.nextElementSibling || addRow();
    nameOf(next).focus();
  });
  // a pasted list becomes one row per line
  input.addEventListener("paste", (e) => {
    const lines = (e.clipboardData?.getData("text") || "").split("\n").filter((l) => l.trim());
    if (lines.length < 2) return;
    e.preventDefault();
    const blank = !input.value.trim();
    lines.forEach((l, i) => {
      const { name: n, optional: o } = parseLine(l);
      if (i === 0 && blank) {
        input.value = n;
        box.checked = o;
      } else addRow(n, o);
    });
    // tidy up: drop the blank rows the paste left in the middle, keep one at the end
    rows()
      .filter((r) => !nameOf(r).value.trim())
      .forEach((r) => r.remove());
    addRow();
  });
  $("mIngRows").append(row);
  placeholders();
  return row;
}
function placeholders() {
  rows().forEach((r, i) => (nameOf(r).placeholder = i === 0 ? "e.g. chicken thigh" : "Add another"));
}

// Meals used to mark optional ingredients by starting the line with "maybe"; that still works.
export function parseLine(line) {
  const text = line.trim();
  const opt = /^maybe\b/i.test(text);
  return {
    name: text
      .replace(/^maybe\b\s*(some\s+)?/i, "")
      .trim()
      .toLowerCase(),
    optional: opt,
  };
}
// Rows to stored ingredients: lowercase, blanks dropped, optional ones last.
function readRows() {
  return maybeLast(
    rows()
      .map((r) => {
        const { name, optional } = parseLine(nameOf(r).value);
        return ing(name, optional || r.querySelector("[type=checkbox]").checked);
      })
      .filter((x) => x.name),
  );
}

export function openMeal(id, { prefill = "", onDone: cb = null } = {}) {
  editing = id;
  onDone = cb;
  const m = id ? mealById(id) : null;
  $("mealTitle").textContent = m ? "Edit meal" : "Add a meal";
  $("mName").value = m ? m.name : prefill;
  $("mIngRows").replaceChildren();
  (m ? m.ingredients : []).forEach((x) => addRow(x.name, x.optional));
  addRow();
  $("mNotes").value = (m && m.notes) || "";
  $("mDel").hidden = !m;
  openDialog("mealDlg");
  // a new meal starts at its name; editing doesn't pop the keyboard until you tap a field
  if (m) $("mName").blur();
  else $("mName").focus();
}

function finish(id) {
  closeDialog("mealDlg");
  render();
  const cb = onDone;
  onDone = null;
  if (cb) cb(id);
}

export function initEditor() {
  $("mealForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const name = $("mName").value.trim();
    if (!name) return;
    const id = upsertMeal(editing, { name, ingredients: readRows(), notes: $("mNotes").value.trim() });
    finish(id);
  });
  $("mDel").onclick = async () => {
    const m = mealById(editing);
    if (!m) return;
    const yes = await confirmSheet({
      title: `Delete ${m.name}?`,
      message: "It will also be removed from any nights it is planned for.",
      ok: "Delete meal",
    });
    if (!yes) return;
    deleteMeal(editing);
    finish(null);
  };
}
