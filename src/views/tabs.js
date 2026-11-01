import { $ } from "../dom.js";

const TABS = ["week", "meals", "shop"];

export function showTab(t) {
  document.querySelectorAll("nav button").forEach((b) => b.setAttribute("aria-selected", b.dataset.tab === t));
  TABS.forEach((s) => ($(s).hidden = s !== t));
  try {
    history.replaceState(null, "", "#" + t);
  } catch {
    location.hash = t;
  }
}

const fromHash = () => {
  const h = location.hash.slice(1);
  if (TABS.includes(h)) showTab(h);
};

export function initTabs() {
  document.querySelectorAll("nav button").forEach((b) => (b.onclick = () => showTab(b.dataset.tab)));
  window.addEventListener("hashchange", fromHash);
  fromHash();
}
