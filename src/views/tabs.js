import { $, weekIcon, mealsIcon, shopIcon } from "../dom.js";

const TABS = ["week", "meals", "shop"];
const buttons = () => document.querySelectorAll(".tabbar button");

export function showTab(t) {
  buttons().forEach((b) => b.setAttribute("aria-selected", b.dataset.tab === t));
  TABS.forEach((s) => ($(s).hidden = s !== t));
  scrollTo(0, 0);
  try {
    history.replaceState(null, "", location.pathname + location.search + "#" + t);
  } catch {
    location.hash = t;
  }
}

const fromHash = () => {
  const h = location.hash.slice(1);
  if (TABS.includes(h)) showTab(h);
};

// The full title shows on a first visit until the page scrolls; after that the header is compact.
function compactHeader() {
  const root = document.documentElement;
  try {
    localStorage.setItem("seen", "1");
  } catch {
    /* storage off: the title just collapses on scroll each time */
  }
  if (root.classList.contains("compact")) return;
  const onScroll = () => {
    if (scrollY < 24) return;
    root.classList.add("compact");
    removeEventListener("scroll", onScroll);
  };
  addEventListener("scroll", onScroll, { passive: true });
}

export function initTabs() {
  const icons = { week: weekIcon, meals: mealsIcon, shop: shopIcon };
  buttons().forEach((b) => {
    b.prepend(icons[b.dataset.tab]());
    b.onclick = () => showTab(b.dataset.tab);
  });
  // the header is sticky; anything that sticks beneath it needs to know how tall it is
  const header = document.querySelector("header");
  const measure = () => document.documentElement.style.setProperty("--header-h", header.offsetHeight + "px");
  new ResizeObserver(measure).observe(header);
  measure();
  compactHeader();
  window.addEventListener("hashchange", fromHash);
  fromHash();
}
