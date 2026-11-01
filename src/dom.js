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
export const clearIcon = () => icon(`<svg viewBox="0 0 24 24" ${STROKE}><path d="M6 6l12 12M18 6 6 18"/></svg>`);
export const plusIcon = () => icon(`<svg viewBox="0 0 24 24" ${STROKE}><path d="M12 5v14M5 12h14"/></svg>`);
export const editIcon = () =>
  icon(
    `<svg viewBox="0 0 24 24" ${STROKE}><path d="M4 20h4l10.5-10.5a2.1 2.1 0 0 0-3-3L5 17z"/><path d="M13.5 6.5l3 3"/></svg>`,
  );

let toastTimer;
export function toast(msg) {
  let t = document.querySelector(".toast");
  if (!t) {
    t = el("div", { class: "toast", role: "status" });
    document.body.append(t);
  }
  t.textContent = msg;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.remove(), 2800);
}
