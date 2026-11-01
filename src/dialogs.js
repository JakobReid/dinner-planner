// Modal dialogs on phones: the page stays put underneath, and an open dialog shrinks to the
// visible viewport so the on-screen keyboard never hides its buttons.
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
      d.style.top = "";
      return;
    }
    d.style.maxHeight = Math.max(200, vv.height - 32) + "px";
    d.style.top = vv.offsetTop + "px";
  });
}

export function openDialog(id) {
  lockScroll();
  $(id).showModal();
  fitDialogs();
}
export const closeDialog = (id) => $(id).close();
export const isOpen = (id) => $(id).open;

export function initDialogs() {
  if (vv) {
    vv.addEventListener("resize", fitDialogs);
    vv.addEventListener("scroll", fitDialogs);
  }
  document.querySelectorAll("dialog").forEach((d) =>
    d.addEventListener("close", () => {
      d.style.maxHeight = "";
      d.style.top = "";
      unlockScroll();
    }),
  );
  document.querySelectorAll("[data-close]").forEach((b) => (b.onclick = () => b.closest("dialog").close()));
  // once the keyboard has settled, bring the focused field back into view
  document
    .querySelectorAll("dialog input,dialog textarea")
    .forEach((f) => f.addEventListener("focus", () => setTimeout(() => f.scrollIntoView({ block: "nearest" }), 300)));
}
