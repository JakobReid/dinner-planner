import { $, weekIcon, mealsIcon, shopIcon } from "../dom.js";

const TABS = ["week", "meals", "shop", "profile"];
const buttons = () => document.querySelectorAll(".tabbar button");
const shown = []; // told whenever a tab is shown

export const onTab = (fn) => shown.push(fn);

export function showTab(t) {
  buttons().forEach((b) => b.setAttribute("aria-selected", b.dataset.tab === t));
  TABS.forEach((s) => ($(s).hidden = s !== t));
  // the week arrows mean nothing on the profile tab
  document.querySelector("header").hidden = t === "profile";
  scrollTo(0, 0);
  try {
    history.replaceState(null, "", location.pathname + location.search + "#" + t);
  } catch {
    location.hash = t;
  }
  shown.forEach((fn) => fn(t));
}

const fromHash = () => {
  const h = location.hash.slice(1);
  if (TABS.includes(h)) showTab(h);
};

export function initTabs() {
  const icons = { week: weekIcon, meals: mealsIcon, shop: shopIcon };
  buttons().forEach((b) => {
    if (icons[b.dataset.tab]) b.prepend(icons[b.dataset.tab]()); // the profile tab shows the avatar
    b.onclick = () => showTab(b.dataset.tab);
  });
  // the header is sticky; anything that sticks beneath it needs to know how tall it is
  const header = document.querySelector("header");
  const measure = () => document.documentElement.style.setProperty("--header-h", header.offsetHeight + "px");
  new ResizeObserver(measure).observe(header);
  measure();
  window.addEventListener("hashchange", fromHash);
  fromHash();
}
