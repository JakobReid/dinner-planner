// Bottom sheets. Every dialog slides up from the foot of the screen with its actions pinned in
// a footer. The page stays put underneath, a sheet shrinks to the visible viewport so the
// on-screen keyboard never hides its buttons, and dragging the head down (or tapping outside)
// dismisses it.
import { $ } from "./dom.js";

let lockY = 0;
function lockScroll() {
  if (document.body.style.position === "fixed") return;
  lockY = scrollY;
  Object.assign(document.body.style, { position: "fixed", top: -lockY + "px", left: "0", right: "0" });
}
function unlockScroll() {
  if (document.querySelector("dialog[open]")) return;
  Object.assign(document.body.style, { position: "", top: "", left: "", right: "" });
  scrollTo(0, lockY);
}

const vv = window.visualViewport;
function fitDialogs() {
  document.querySelectorAll("dialog[open]").forEach((d) => {
    if (!vv) {
      d.style.maxHeight = "";
      d.style.bottom = "";
      return;
    }
    // leave a strip of page showing above the sheet, less of one when the keyboard is up
    d.style.maxHeight = Math.max(200, vv.height - (vv.height < 500 ? 12 : 56)) + "px";
    d.style.bottom = Math.max(0, window.innerHeight - vv.height - vv.offsetTop) + "px";
  });
}

export function openDialog(id) {
  lockScroll();
  $(id).showModal();
  fitDialogs();
}
export const closeDialog = (id) => $(id).close();

// Ask before something destructive. Resolves true only if the red button was pressed.
export function confirmSheet({ title, message, ok }) {
  return new Promise((resolve) => {
    $("confirmTitle").textContent = title;
    $("confirmMsg").textContent = message;
    $("confirmOk").textContent = ok;
    let yes = false;
    $("confirmOk").onclick = () => {
      yes = true;
      closeDialog("confirmDlg");
    };
    $("confirmDlg").addEventListener("close", () => resolve(yes), { once: true });
    openDialog("confirmDlg");
  });
}

// Drag the head of a sheet down to dismiss it; a short drag springs back.
function swipeToDismiss(d) {
  const head = d.querySelector(".sheet-head");
  if (!head) return;
  let y0 = null;
  let dy = 0;
  head.addEventListener("pointerdown", (e) => {
    y0 = e.clientY;
    dy = 0;
    head.setPointerCapture(e.pointerId);
    d.style.transition = "none";
  });
  head.addEventListener("pointermove", (e) => {
    if (y0 === null) return;
    dy = Math.max(0, e.clientY - y0);
    d.style.transform = `translateY(${dy}px)`;
  });
  const end = () => {
    if (y0 === null) return;
    y0 = null;
    d.style.transition = "";
    if (dy > 80) d.close();
    else d.style.transform = "";
  };
  head.addEventListener("pointerup", end);
  head.addEventListener("pointercancel", end);
}

export function initDialogs() {
  if (vv) {
    vv.addEventListener("resize", fitDialogs);
    vv.addEventListener("scroll", fitDialogs);
  }
  document.querySelectorAll("dialog").forEach((d) => {
    swipeToDismiss(d);
    // a tap on the dimmed page closes the sheet, except a form that could lose typing
    // (the press has to start there too: dragging a text selection out of the sheet doesn't count)
    let pressedOutside = false;
    d.addEventListener("pointerdown", (e) => (pressedOutside = e.target === d));
    d.addEventListener("click", (e) => {
      if (e.target === d && pressedOutside && !d.hasAttribute("data-keep")) d.close();
    });
    d.addEventListener("close", () => {
      d.style.maxHeight = "";
      d.style.bottom = "";
      d.style.transform = "";
      unlockScroll();
    });
  });
  document.querySelectorAll("[data-close]").forEach((b) => (b.onclick = () => b.closest("dialog").close()));
  // once the keyboard has settled, bring the focused field back into view
  document.querySelector("body").addEventListener("focusin", (e) => {
    const f = e.target;
    if (f.matches("dialog input, dialog textarea")) setTimeout(() => f.scrollIntoView({ block: "nearest" }), 300);
  });
}
