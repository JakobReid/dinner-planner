// Shopping list for the viewed week, grouped by aisle. Ticked items move to "In the trolley" and
// things you already have move to "Already have", both folded away under the list.
import { AISLES } from "../aisles.js";
import { $, el, toast } from "../dom.js";
import {
  wk,
  keyOf,
  aisleOf,
  shoppingItems,
  sourceTag,
  tick,
  setHave,
  addExtra,
  setExtraDone,
  removeExtra,
  setAisle,
} from "../state.js";
import { onRender } from "../render.js";
import { openDialog, closeDialog } from "../dialogs.js";

const open = { trolley: false, have: false }; // which folds are open, kept while the app is

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

// Long press a row to move it to another aisle without going into Edit aisles.
function moveSheet(key, name) {
  const cur = aisleOf(key);
  $("aisleTitle").textContent = `Move ${name}`;
  $("aisleList").replaceChildren(
    ...AISLES.map(([id, label]) =>
      el(
        "button",
        {
          class: "plain" + (id === cur ? " cur" : ""),
          onclick: () => {
            setAisle(key, id);
            closeDialog("aisleDlg");
            renderShop();
          },
        },
        label,
      ),
    ),
  );
  openDialog("aisleDlg");
}
function longPress(row, fn) {
  let timer = null;
  let x = 0;
  let y = 0;
  const stop = () => clearTimeout(timer);
  row.addEventListener("pointerdown", (e) => {
    if (e.target.closest("button, select")) return;
    x = e.clientX;
    y = e.clientY;
    stop();
    timer = setTimeout(() => {
      // the list was redrawn under the finger (a tick, or a change from another device), so this
      // row is gone and its press never got to end: that isn't a long press
      if (!row.isConnected) return;
      // the press ends in a click on the row; swallow it so the box isn't ticked as well
      row.addEventListener("click", (c) => c.preventDefault(), { once: true, capture: true });
      fn();
    }, 550);
  });
  row.addEventListener("pointermove", (e) => {
    if (Math.abs(e.clientX - x) > 10 || Math.abs(e.clientY - y) > 10) stop();
  });
  ["pointerup", "pointercancel", "pointerleave"].forEach((t) => row.addEventListener(t, stop));
  row.addEventListener("contextmenu", (e) => e.preventDefault());
}

export function renderShop() {
  const box = $("shopList");
  const done = $("shopDone");
  box.replaceChildren();
  done.replaceChildren();
  const w = wk();
  const have = w.have || {};
  const items = shoppingItems();
  const needed = items.filter((i) => !have[i.key]);
  const toBuy = needed.filter((i) => !w.checked[i.key]);
  const extrasLeft = w.extras.filter((e) => !e.done);
  const inTrolley = [...needed.filter((i) => w.checked[i.key]), ...w.extras.filter((e) => e.done)];
  const owned = items.filter((i) => have[i.key]);
  // the badge and the summary count the same thing: items still to buy, optional ones aside
  const left = toBuy.filter((i) => !i.optional).length + extrasLeft.length;
  const c = $("shopCount");
  c.hidden = !left;
  c.textContent = left;
  c.setAttribute("aria-label", `${left} left to buy`);
  const sorting = $("shop").classList.contains("sorting");
  $("shopSummary").textContent = sorting
    ? "Choose an aisle for each item."
    : [`${left} to buy`, inTrolley.length ? `${inTrolley.length} in the trolley` : ""].filter(Boolean).join(" · ");
  if (!items.length && !w.extras.length) {
    if (!sorting) $("shopSummary").textContent = "";
    box.append(el("div", { class: "empty-state" }, "Plan some meals and their ingredients will show up here."));
    return;
  }

  const itemRow = (it) => {
    const id = "c-" + it.key.replace(/\W+/g, "-");
    const on = !!w.checked[it.key];
    const row = el(
      "div",
      { class: "item" + (it.optional ? " maybe" : "") },
      el("input", {
        type: "checkbox",
        id,
        ...(on ? { checked: "" } : {}),
        onchange: (e) => {
          tick(it.key, e.target.checked);
          renderShop();
        },
      }),
      el(
        "label",
        { for: id },
        el("span", { class: "t" }, it.name),
        it.optional ? el("span", { class: "tag" }, "optional") : null,
        sourceTag(it) ? el("span", { class: "qty" }, sourceTag(it)) : null,
      ),
      aislePicker(it.key, it.name),
      on
        ? null
        : el(
            "button",
            {
              class: "have",
              "aria-label": `Already have ${it.name}`,
              onclick: () => {
                setHave(it.key, true);
                renderShop();
                toast(`Took ${it.name} off the list.`, {
                  label: "Undo",
                  fn: () => {
                    setHave(it.key, false);
                    renderShop();
                  },
                });
              },
            },
            "Have it",
          ),
    );
    longPress(row, () => moveSheet(it.key, it.name));
    return row;
  };
  const extraRow = (x) => {
    const id = "e-" + x.id;
    const row = el(
      "div",
      { class: "item" },
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
    longPress(row, () => moveSheet(keyOf(x.name), x.name));
    return row;
  };

  // one block per aisle in walk-the-shop order; required before optional, then alphabetical.
  // Edit aisles shows everything that's needed, ticked or not, so any of it can be refiled.
  const listed = sorting ? needed : toBuy;
  const extras = sorting ? w.extras : extrasLeft;
  const sorted = [...listed].sort((a, b) => a.optional - b.optional || a.name.localeCompare(b.name));
  AISLES.forEach(([id, label]) => {
    const rows = [
      ...sorted.filter((i) => aisleOf(i.key) === id).map(itemRow),
      ...extras.filter((x) => aisleOf(keyOf(x.name)) === id).map(extraRow),
    ];
    if (rows.length) box.append(el("div", { class: "group" }, el("h2", {}, label), rows));
  });
  if (!box.children.length) box.append(el("p", { class: "muted" }, "Nothing left to buy."));

  const fold = (key, title, rows) => {
    if (!rows.length) return;
    const d = el(
      "details",
      { class: "fold", id: "fold-" + key, ...(open[key] ? { open: "" } : {}) },
      el("summary", {}, title, el("small", {}, String(rows.length))),
      rows,
    );
    d.addEventListener("toggle", () => (open[key] = d.open));
    done.append(d);
  };
  fold(
    "trolley",
    "In the trolley",
    inTrolley.map((x) => ("key" in x ? itemRow(x) : extraRow(x))),
  );
  fold(
    "have",
    "Already have",
    owned.map((it) =>
      el(
        "div",
        { class: "item" },
        el("label", {}, el("span", { class: "t" }, it.name)),
        el(
          "button",
          {
            class: "have",
            "aria-label": `Put ${it.name} back on the list`,
            onclick: () => {
              setHave(it.key, false);
              renderShop();
            },
          },
          "Add back",
        ),
      ),
    ),
  );
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
  // aisle pickers stay out of the way until you ask for them; Done sits in the same sticky bar
  $("aisleMode").onclick = () => {
    const on = $("shop").classList.toggle("sorting");
    $("aisleMode").textContent = on ? "Done" : "Edit aisles";
    $("aisleMode").classList.toggle("quiet", !on);
    renderShop();
  };
}
