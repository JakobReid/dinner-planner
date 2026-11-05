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
export const shareIcon = () =>
  icon(
    `<svg viewBox="0 0 24 24" ${STROKE}><path d="M4 12v7a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7"/><path d="M12 15V3"/><path d="m7 8 5-5 5 5"/></svg>`,
  );
export const leaveIcon = () =>
  icon(
    `<svg viewBox="0 0 24 24" ${STROKE}><path d="M9 4H5a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1h4"/><path d="M20 12H9"/><path d="m16 8 4 4-4 4"/></svg>`,
  );
export const userIcon = () =>
  icon(`<svg viewBox="0 0 24 24" ${STROKE}><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></svg>`);
export const mailIcon = () =>
  icon(
    `<svg viewBox="0 0 24 24" ${STROKE}><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/></svg>`,
  );
export const checkIcon = () => icon(`<svg viewBox="0 0 24 24" ${STROKE}><path d="m5 12 5 5 9-10"/></svg>`);
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
