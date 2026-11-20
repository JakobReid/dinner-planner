// Tiny DOM helpers: element lookup, element builder, inline icons and the toast.
export const $ = (id) => document.getElementById(id);

// el("div", {class:"x", onclick:fn}, ...children). Strings become text nodes; null/false are skipped.
export function el(tag, attrs, ...kids) {
  const e = document.createElement(tag);
  for (const k in attrs || {}) {
    if (k === "class") e.className = attrs[k];
    else if (k.startsWith("on")) e.addEventListener(k.slice(2), attrs[k]);
    else e.setAttribute(k, attrs[k]);
  }
  kids.flat().forEach((c) => {
    if (c != null && c !== false) e.append(c.nodeType ? c : document.createTextNode(c));
  });
  return e;
}

function icon(svg) {
  const s = document.createElement("span");
  s.className = "ico";
  s.setAttribute("aria-hidden", "true");
  s.innerHTML = svg;
  return s;
}
const STROKE = 'fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"';
export const outIcon = () =>
  icon(
    `<svg viewBox="0 0 24 24" ${STROKE}><path d="M4 10h16l-1.6 10H5.6z"/><path d="M6.5 10 8.5 4h7l2 6"/><path d="M10 4l1 6M14 4l-1 6"/></svg>`,
  );
export const leftoversIcon = () =>
  icon(
    `<svg viewBox="0 0 24 24" ${STROKE}><path d="M3 12h18a9 9 0 0 1-18 0z"/><path d="M9 3c0 2-1.5 2.5-1.5 4.5M14 3c0 2-1.5 2.5-1.5 4.5"/></svg>`,
  );
export const userIcon = () =>
  icon(`<svg viewBox="0 0 24 24" ${STROKE}><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></svg>`);
export const editIcon = () =>
  icon(
    `<svg viewBox="0 0 24 24" ${STROKE}><path d="M4 20h4l10.5-10.5a2.1 2.1 0 0 0-3-3L5 17z"/><path d="M13.5 6.5l3 3"/></svg>`,
  );

export const gearIcon = () =>
  icon(
    `<svg viewBox="0 0 24 24" ${STROKE}><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>`,
  );
export const plusIcon = () => icon(`<svg viewBox="0 0 24 24" ${STROKE}><path d="M12 5v14M5 12h14"/></svg>`);
export const closeIcon = () => icon(`<svg viewBox="0 0 24 24" ${STROKE}><path d="M6 6l12 12M18 6 6 18"/></svg>`);
export const upIcon = () => icon(`<svg viewBox="0 0 24 24" ${STROKE}><path d="m6 15 6-6 6 6"/></svg>`);
export const downIcon = () => icon(`<svg viewBox="0 0 24 24" ${STROKE}><path d="m6 9 6 6 6-6"/></svg>`);

export const prevIcon = () => icon(`<svg viewBox="0 0 24 24" ${STROKE}><path d="m15 5-7 7 7 7"/></svg>`);
export const nextIcon = () => icon(`<svg viewBox="0 0 24 24" ${STROKE}><path d="m9 5 7 7-7 7"/></svg>`);
export const moreIcon = () =>
  icon(
    `<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/></svg>`,
  );
export const weekIcon = () =>
  icon(
    `<svg viewBox="0 0 24 24" ${STROKE}><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/></svg>`,
  );
export const mealsIcon = () =>
  icon(
    `<svg viewBox="0 0 24 24" ${STROKE}><path d="M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3z"/><path d="M5 17a3 3 0 0 1 3-3h11"/><path d="M9 8h6"/></svg>`,
  );
export const shopIcon = () =>
  icon(
    `<svg viewBox="0 0 24 24" ${STROKE}><path d="M3 4h2.5l2.2 11h10.6L20.5 7H6.4"/><circle cx="9" cy="19" r="1.5"/><circle cx="17" cy="19" r="1.5"/></svg>`,
  );

// One toast at a time. `action` adds a button, e.g. { label: "Undo", fn }. It sits above the tab
// bar, or at the top of the screen while a sheet is open; as a popover it stays above open dialogs.
let toastTimer;
export function toast(msg, action) {
  let t = document.querySelector(".toast");
  if (!t) {
    t = el("div", { class: "toast", role: "status", popover: "manual" });
    document.body.append(t);
  }
  const hide = () => {
    clearTimeout(toastTimer);
    try {
      t.hidePopover();
    } catch {
      /* not showing, or no popover support */
    }
    t.hidden = true;
  };
  hide();
  t.replaceChildren(el("span", {}, msg));
  if (action)
    t.append(
      el(
        "button",
        {
          type: "button",
          onclick: () => {
            hide();
            action.fn();
          },
        },
        action.label,
      ),
    );
  t.classList.toggle("top", !!document.querySelector("dialog[open]"));
  t.hidden = false;
  try {
    t.showPopover();
  } catch {
    /* older browsers show it as a plain fixed element */
  }
  toastTimer = setTimeout(hide, action ? 7000 : 3200);
  if (!t.classList.contains("top")) clearOf(t);
}

// The page keeps room at its foot for a toast. If one lands on the last control on the page,
// scroll up just enough to clear it.
function clearOf(t) {
  const controls = [...document.querySelectorAll(".wrap :is(button, input, select, summary)")].filter(
    (c) => c.getClientRects().length,
  );
  const last = controls.reduce(
    (a, c) => (!a || c.getBoundingClientRect().bottom > a.getBoundingClientRect().bottom ? c : a),
    null,
  );
  if (!last) return;
  const over = last.getBoundingClientRect().bottom - t.getBoundingClientRect().top;
  if (over > 0 && over < t.offsetHeight + 80) scrollBy({ top: over + 8, behavior: "smooth" });
}
