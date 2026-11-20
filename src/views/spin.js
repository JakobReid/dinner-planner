// Spin the wheel: one empty night at a time, a reel of meal names lands on a pick, and you keep
// it, spin again or skip. Only empty nights from today on are offered, so nothing already
// planned is ever overwritten. A filter narrows the reel to meals with that ingredient.
import { DAYS, DAY_FULL, addDays, fmt } from "../dates.js";
import { $, el, toast } from "../dom.js";
import { viewWeek, state, curTime, isMain, emptyNights, spinPool, spinExcluded, spin, setNight } from "../state.js";
import { render } from "../render.js";
import { openDialog, closeDialog } from "../dialogs.js";

let nights = []; // days still to do
let tags = []; // ingredient filters, every one has to match
let at = 0;
let pick = null; // meal showing on the reel
let kept = []; // row indexes planned this session, flashed at the end
let token = 0; // ignores a stale transitionend after a re-spin
let timer = null;

// dinners fill nights; breakfasts, lunches and the rest fill days
const unit = (n) => (isMain() ? "night" : "day") + (n === 1 ? "" : "s");

const REEL = 24; // names that scroll past before the landing one
const still = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

export function openSpin() {
  if (!state.meals.length) return toast("Add a meal first.");
  nights = emptyNights();
  if (!nights.length) return toast(`No empty ${unit(2)} left this week.`);
  at = 0;
  kept = [];
  tags = [];
  $("spinQ").value = "";
  $("spinFills").textContent =
    `Fills ${nights.length} empty ${unit(nights.length)}` +
    `: ${nights.join(", ")}. Planned ${unit(2)} are not changed.`;
  paintTags();
  openDialog("spinDlg");
  night();
}

// Committed tags plus whatever is half-typed, so the reel narrows as you go.
const terms = () => [...tags, $("spinQ").value.trim().toLowerCase()].filter(Boolean);

function paintTags() {
  $("spinTags").replaceChildren(
    ...tags.map((t) =>
      el("button", { type: "button", class: "tag", "aria-label": `Remove ${t}`, onclick: () => dropTag(t) }, `${t} ×`),
    ),
  );
  $("spinQ").placeholder = tags.length ? "Add another" : "Filter by ingredient";
}
function addTag() {
  const v = $("spinQ").value.trim().toLowerCase();
  $("spinQ").value = "";
  if (v && !tags.includes(v)) tags.push(v);
  paintTags();
  go(null);
}
function dropTag(t) {
  tags = tags.filter((x) => x !== t);
  paintTags();
  go(null);
}

function night() {
  const d = nights[at];
  const i = DAYS.indexOf(d);
  $("spinTitle").textContent = `${DAY_FULL[i]} ${fmt(addDays(viewWeek, i))}`;
  $("spinStep").textContent = isMain()
    ? `Night ${at + 1} of ${nights.length}`
    : `${curTime().name} · Day ${at + 1} of ${nights.length}`;
  go(null);
}

// Say which matching meals the wheel is leaving out, and why.
function paintWhy(q) {
  const out = spinExcluded(q);
  const shown = out.slice(0, 3).map((x) => `${x.name} (${x.why})`);
  if (out.length > 3) shown.push(`${out.length - 3} more`);
  $("spinWhy").hidden = !out.length;
  $("spinWhy").textContent = out.length ? `Left out: ${shown.join(", ")}.` : "";
}

// Build a strip that ends on the pick and slide it into view.
function go(prev) {
  const q = terms();
  pick = spin(q, prev);
  paintWhy(q);
  const reel = $("spinReel");
  const strip = $("spinStrip");
  const my = ++token;
  clearTimeout(timer);
  reel.classList.remove("landed", "none");
  strip.classList.remove("go");
  strip.style.transform = "";
  $("spinKeep").disabled = true;
  if (!pick) {
    reel.classList.add("none");
    strip.replaceChildren(
      el("span", {}, el("i", {}, q.length ? `No meals with ${q.join(" and ")}.` : "No meals yet.")),
    );
    return;
  }
  // names scroll past and the pick lands on the middle line. No name sits next to itself, and
  // the two either side of the pick differ from it and from each other where the pool allows.
  const names = spinPool(q).map((m) => m.name);
  // a random name avoiding `not`; if that rules everything out, the later exclusions are dropped
  const anyBut = (...not) => {
    for (let k = not.length; k >= 0; k--) {
      const ok = names.filter((x) => !not.slice(0, k).includes(x));
      if (ok.length) return ok[Math.floor(Math.random() * ok.length)];
    }
    return pick.name;
  };
  const n = names.length > 1 && !still() ? REEL : 1;
  // built outwards from the pick, so its neighbours get first choice of the names
  const before = [];
  for (let k = 0; k < n - 1; k++) before.push(anyBut(before.at(-1) ?? pick.name, k === 1 ? pick.name : before.at(-2)));
  const items = [...before].reverse();
  items.push(pick.name);
  if (names.length > 1) {
    const after = anyBut(pick.name, before[0], before[1]);
    items.push(after, anyBut(after, pick.name, before[0], before[1]));
  }
  // long names drop a size rather than get cut off
  const cls = (t, k) => [k === n - 1 && "pick", t.length > 22 && "long"].filter(Boolean).join(" ");
  strip.replaceChildren(...items.map((t, k) => el("span", { class: cls(t, k) }, el("i", {}, t))));
  const target = strip.children[n - 1];
  const line = target.offsetHeight;
  const land = () => {
    clearTimeout(timer);
    if (my !== token) return;
    reel.classList.add("landed");
    $("spinKeep").disabled = false;
  };
  strip.style.transform = `translateY(${2 * line}px)`; // first name on the middle line
  if (n === 1) return land();
  void strip.offsetHeight; // start from the top before the slide
  strip.classList.add("go");
  strip.style.transform = `translateY(-${target.offsetTop - 2 * line}px)`;
  strip.addEventListener("transitionend", land, { once: true });
  timer = setTimeout(land, 2600); // in case the transition never fires
}

function next() {
  at++;
  if (at < nights.length) return night();
  closeDialog("spinDlg");
  render({ flash: kept });
  if (kept.length) toast(`${kept.length} ${unit(kept.length)} planned.`);
}

export function initSpin() {
  $("spinBtn").onclick = openSpin;
  $("spinKeep").onclick = () => {
    if (!pick) return;
    setNight(nights[at], pick.id);
    kept.push(DAYS.indexOf(nights[at]));
    next();
  };
  $("spinAgain").onclick = () => go(pick && pick.id);
  $("spinSkip").onclick = next;
  let deb;
  $("spinQ").addEventListener("input", () => {
    clearTimeout(deb);
    deb = setTimeout(() => go(null), 300);
  });
  $("spinQ").addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      addTag();
    } else if (e.key === "Backspace" && !$("spinQ").value && tags.length) dropTag(tags.at(-1));
  });
  $("spinTagbox").onclick = (e) => {
    if (e.target === e.currentTarget || e.target.id === "spinTags") $("spinQ").focus();
  };
  // stopping part way keeps what was kept so far
  $("spinDlg").addEventListener("close", () => {
    if (kept.length && at < nights.length) render({ flash: kept });
    kept = [];
    at = nights.length;
  });
}
