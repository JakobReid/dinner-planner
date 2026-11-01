// Add / edit meal dialog. `onDone(id)` fires after a save (new or existing id) or a delete (null).
import { $ } from "../dom.js";
import { mealById, ing, maybeLast, upsertMeal, deleteMeal } from "../state.js";
import { render } from "../render.js";
import { openDialog, closeDialog } from "../dialogs.js";

let editing = null;
let onDone = null;

export function openMeal(id, { prefill = "", onDone: cb = null } = {}) {
  editing = id;
  onDone = cb;
  const m = id ? mealById(id) : null;
  $("mealTitle").textContent = m ? "Edit meal" : "Add a meal";
  $("mName").value = m ? m.name : prefill;
  $("mIng").value = m ? m.ingredients.map((x) => (x.optional ? "maybe " : "") + x.name).join("\n") : "";
  $("mNotes").value = m ? m.notes : "";
  $("mDel").hidden = !m;
  openDialog("mealDlg");
  $("mName").focus();
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
    const name = $("mName").value.trim();
    if (!name) return;
    const id = upsertMeal(editing, {
      name,
      ingredients: parseIngredients($("mIng").value),
      notes: $("mNotes").value.trim(),
    });
    finish(id);
  });
  $("mDel").onclick = () => {
    const m = mealById(editing);
    if (!m || !confirm(`Delete ${m.name}? It also comes off any planned nights.`)) return;
    deleteMeal(editing);
    finish(null);
  };
}
