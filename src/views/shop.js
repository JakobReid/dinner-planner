import { AISLES } from "../aisles.js";
import { $, el } from "../dom.js";
import {
  wk,
  keyOf,
  aisleOf,
  shoppingItems,
  tick,
  addExtra,
  setExtraDone,
  removeExtra,
  untickAll,
  setAisle,
} from "../state.js";
import { onRender } from "../render.js";

// A native select styled as a chip: setting it files this ingredient under that aisle in every meal.
function aislePicker(key, name) {
  const cur = aisleOf(key);
  const sel = el("select", {
    class: "aisle",
    "aria-label": `Aisle for ${name}`,
    onchange: (e) => {
      setAisle(key, e.target.value);
      renderShop();
    },
  });
  AISLES.forEach(([id, label]) =>
    sel.append(el("option", { value: id, ...(id === cur ? { selected: "" } : {}) }, label)),
  );
  return sel;
}

export function renderShop() {
  const box = $("shopList");
  box.replaceChildren();
  const w = wk();
  const items = shoppingItems();
  const left = items.filter((i) => !i.optional && !w.checked[i.key]).length + w.extras.filter((e) => !e.done).length;
  const c = $("shopCount");
  c.hidden = !left;
  c.textContent = left;
  if (!items.length && !w.extras.length) {
    box.append(
      el(
        "div",
        { class: "empty-state" },
        "Nothing to buy for this week yet. Pick some dinners on the Week tab and the ingredients land here.",
      ),
    );
    return;
  }
  const row = (it) => {
    const id = "c-" + it.key.replace(/\W+/g, "-");
    const done = !!w.checked[it.key];
    return el(
      "div",
      { class: "item" + (done ? " done" : "") + (it.optional ? " maybe" : "") },
      el("input", {
        type: "checkbox",
        id,
        ...(done ? { checked: "" } : {}),
        onchange: (e) => {
          tick(it.key, e.target.checked);
          renderShop();
        },
      }),
      el(
        "label",
        { for: id },
        it.optional ? el("span", { class: "tag" }, "maybe ") : null,
        el("span", { class: "t" }, it.name),
        it.meals.length > 1 ? el("span", { class: "qty" }, "×" + it.meals.length) : null,
      ),
      aislePicker(it.key, it.name),
    );
  };
  const extraRow = (x) => {
    const id = "e-" + x.id;
    return el(
      "div",
      { class: "item" + (x.done ? " done" : "") },
      el("input", {
        type: "checkbox",
        id,
        ...(x.done ? { checked: "" } : {}),
        onchange: (e) => {
          setExtraDone(x, e.target.checked);
          renderShop();
        },
      }),
      el("label", { for: id }, el("span", { class: "t" }, x.name)),
      aislePicker(keyOf(x.name), x.name),
      el(
        "button",
        {
          class: "x",
          "aria-label": `Remove ${x.name}`,
          onclick: () => {
            removeExtra(x);
            renderShop();
          },
        },
        "×",
      ),
    );
  };
  // one block per aisle in walk-the-shop order; required before maybe, then alphabetical
  const sorted = [...items].sort((a, b) => a.optional - b.optional || a.name.localeCompare(b.name));
  AISLES.forEach(([id, label]) => {
    const rows = [
      ...sorted.filter((i) => aisleOf(i.key) === id).map(row),
      ...w.extras.filter((x) => aisleOf(keyOf(x.name)) === id).map(extraRow),
    ];
    if (rows.length) box.append(el("div", { class: "group" }, el("h2", {}, label), rows));
  });
}

export function initShop() {
  onRender(renderShop);
  const add = () => {
    const v = $("extraIn").value.trim();
    if (!v) return;
    addExtra(v);
    $("extraIn").value = "";
    renderShop();
  };
  $("extraAdd").onclick = add;
  $("extraIn").addEventListener("keydown", (e) => {
    if (e.key === "Enter") add();
  });
  $("untick").onclick = () => {
    untickAll();
    renderShop();
  };
}
