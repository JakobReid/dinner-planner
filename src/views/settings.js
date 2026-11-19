// Theme: System, Light or Dark, remembered on this device. With nothing saved the app is light,
// as it always was; "system" follows the phone and keeps following it if the phone changes.
import { $ } from "../dom.js";

const dark = matchMedia("(prefers-color-scheme: dark)");

function saved() {
  try {
    const t = localStorage.getItem("theme");
    return t === "dark" || t === "system" ? t : "light";
  } catch {
    return "light";
  }
}

function paint() {
  const theme = saved();
  const isDark = theme === "dark" || (theme === "system" && dark.matches);
  if (isDark) document.documentElement.dataset.theme = "dark";
  else delete document.documentElement.dataset.theme;
  // the browser's own bars follow the page
  document.querySelector('meta[name="theme-color"]').content = isDark ? "#1a251f" : "#ffffff";
  $("themeSeg")
    .querySelectorAll("button")
    .forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.theme === theme)));
}

function choose(theme) {
  try {
    if (theme === "light") localStorage.removeItem("theme");
    else localStorage.setItem("theme", theme);
  } catch {
    /* storage off */
  }
  paint();
}

export function initSettings() {
  $("themeSeg").onclick = (e) => {
    const b = e.target.closest("button[data-theme]");
    if (b) choose(b.dataset.theme);
  };
  dark.addEventListener("change", paint);
  paint();
}
