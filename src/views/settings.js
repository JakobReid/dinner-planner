// Settings sheet off the footer cog. Light is the default; dark is remembered on this device.
import { $ } from "../dom.js";
import { openDialog } from "../dialogs.js";

const current = () => (document.documentElement.dataset.theme === "dark" ? "dark" : "light");

function apply(theme) {
  if (theme === "dark") document.documentElement.dataset.theme = "dark";
  else delete document.documentElement.dataset.theme;
  try {
    if (theme === "dark") localStorage.setItem("theme", "dark");
    else localStorage.removeItem("theme");
  } catch {
    /* storage off */
  }
  paint();
}

function paint() {
  $("themeSeg")
    .querySelectorAll("button")
    .forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.theme === current())));
}

export function initSettings() {
  $("themeSeg").onclick = (e) => {
    const b = e.target.closest("button[data-theme]");
    if (b) apply(b.dataset.theme);
  };
  $("settingsBtn").onclick = () => {
    paint();
    openDialog("settingsDlg");
  };
}
