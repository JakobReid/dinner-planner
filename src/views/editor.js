// Add / edit meal sheet. Ingredients are one text box, a line each.
// `onDone(id)` fires after a save (new or existing id) or a delete (null).
import { $ } from "../dom.js";
import { mealById, ing, maybeLast, upsertMeal, deleteMeal } from "../state.js";
import { render } from "../render.js";
import { openDialog, closeDialog, confirmSheet } from "../dialogs.js";

let editing = null;
let onDone = null;

// One ingredient per line; a line starting with "maybe" is optional. Stored lowercase, blanks
// dropped, optional ones last.
export function parseIngredients(text) {
  return maybeLast(
    text
      .split("\n")
      .map((l) => l.trim())
      .map((l) =>
        ing(
          l
            .replace(/^maybe\b\s*(some\s+)?/i, "")
            .trim()
            .toLowerCase(),
          /^maybe\b/i.test(l),
        ),
      )
      .filter((x) => x.name),
  );
}

export function openMeal(id, { prefill = "", onDone: cb = null } = {}) {
  editing = id;
  onDone = cb;
  const m = id ? mealById(id) : null;
  $("mealTitle").textContent = m ? "Edit meal" : "Add a meal";
  $("mName").value = m ? m.name : prefill;
  $("mIng").value = m ? m.ingredients.map((x) => (x.optional ? "maybe " : "") + x.name).join("\n") : "";
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
    const id = upsertMeal(editing, {
      name,
      ingredients: parseIngredients($("mIng").value),
      notes: $("mNotes").value.trim(),
    });
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
