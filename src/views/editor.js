// Add / edit meal dialog. `onDone(id)` fires after a save (new or existing id) or a delete (null).
import { $ } from "../dom.js";
import { mealById, ing, maybeLast, upsertMeal, deleteMeal } from "../state.js";
import { render } from "../render.js";
import { openDialog, closeDialog } from "../dialogs.js";

let editing = null;
let onDone = null;
let viewing = null; // { title, onChange } while showing a planned dinner read-only

const FIELDS = ["mName", "mIng", "mNotes"];
const lines = (id) => $(id).value.split("\n").length;

// Read-only shows the text as written, sized to fit; editing gets the usual boxes.
function setMode(view) {
  $("mealForm").classList.toggle("view", view);
  FIELDS.forEach((f) => ($(f).readOnly = view));
  $("mIng").rows = view ? Math.max(1, lines("mIng")) : 7;
  $("mNotes").rows = view ? Math.max(1, lines("mNotes")) : 3;
  $("mViewActs").hidden = !view;
  $("mEditActs").hidden = view;
}

// `view` shows an existing meal read-only under its own title, with Change dinner and an Edit toggle.
export function openMeal(id, { prefill = "", onDone: cb = null, view = null } = {}) {
  editing = id;
  onDone = cb;
  viewing = view;
  const m = id ? mealById(id) : null;
  $("mealTitle").textContent = view ? view.title : m ? "Edit meal" : "Add a meal";
  $("mName").value = m ? m.name : prefill;
  $("mIng").value = m ? m.ingredients.map((x) => (x.optional ? "maybe " : "") + x.name).join("\n") : "";
  $("mNotes").value = (m && m.notes) || "";
  $("mDel").hidden = !m;
  setMode(!!view);
  openDialog("mealDlg");
  if (view) $("mName").blur();
  else $("mName").focus();
}

// One ingredient per line; a leading "maybe" marks it optional. Stored lowercase, optional last.
export function parseIngredients(text) {
  return maybeLast(
    text
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean)
      .map((l) => {
        const opt = /^maybe\b/i.test(l);
        const n = l.replace(/^maybe\b\s*(some\s+)?/i, "").trim();
        return ing(n.toLowerCase(), opt);
      })
      .filter((x) => x.name),
  );
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
    if (viewing) return;
    const name = $("mName").value.trim();
    if (!name) return;
    const id = upsertMeal(editing, {
      name,
      ingredients: parseIngredients($("mIng").value),
      notes: $("mNotes").value.trim(),
    });
    finish(id);
  });
  $("mEdit").onclick = () => {
    viewing = null;
    $("mealTitle").textContent = "Edit meal";
    setMode(false);
    $("mName").focus();
  };
  $("mChange").onclick = () => {
    const v = viewing;
    closeDialog("mealDlg");
    if (v && v.onChange) v.onChange();
  };
  $("mDel").onclick = () => {
    const m = mealById(editing);
    if (!m || !confirm(`Delete ${m.name}? It also comes off any planned nights.`)) return;
    deleteMeal(editing);
    finish(null);
  };
}
