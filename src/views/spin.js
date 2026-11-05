// Spin the wheel: one empty night at a time, a reel of meal names lands on a pick, and you keep
// it, spin again or skip. A search narrows the reel to meals with that ingredient.
import { DAYS, DAY_FULL, addDays, fmt } from "../dates.js";
import { $, el, toast, checkIcon, againIcon, wheelIcon } from "../dom.js";
import { viewWeek, state, emptyNights, spinPool, spin, setNight } from "../state.js";
import { render } from "../render.js";
import { openDialog, closeDialog } from "../dialogs.js";

let nights = []; // days still to do
let tags = []; // ingredient filters, every one has to match
let at = 0;
let pick = null; // meal showing on the reel
let kept = []; // row indexes planned this session, flashed at the end
let token = 0; // ignores a stale transitionend after a re-spin
let timer = null;

const REEL = 24; // names that scroll past before the landing one
const still = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

export function openSpin() {
  if (!state.meals.length) return toast("Add a meal or two first.");
  nights = emptyNights();
  if (!nights.length) return toast("Every night’s sorted already.");
  at = 0;
  kept = [];
  tags = [];
  $("spinQ").value = "";
  paintTags();
  openDialog("spinDlg");
  night();
}

// Committed tags plus whatever is half-typed, so the reel narrows as you go.
const terms = () => [...tags, $("spinQ").value.trim().toLowerCase()].filter(Boolean);

function paintTags() {
  $("spinTags").replaceChildren(
    ...tags.map((t) =>
      el(
        "span",
        { class: "tag" },
        t,
        el("button", { type: "button", "aria-label": `Remove ${t}`, onclick: () => dropTag(t) }, "×"),
      ),
    ),
  );
  $("spinQ").placeholder = tags.length ? "Add another" : "Narrow it down by ingredient";
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
  $("spinStep").textContent = `Night ${at + 1} of ${nights.length}`;
  go(null);
}

// Build a strip that ends on the pick and slide it into view.
function go(prev) {
  const q = terms();
  pick = spin(q, prev);
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
      el("span", {}, el("i", {}, q.length ? `Nothing with ${q.join(" and ")} yet.` : "No meals yet.")),
    );
    return;
  }
  // names scroll past, the pick lands on the middle line with a neighbour either side
  const names = spinPool(q).map((m) => m.name);
  const any = () => names[Math.floor(Math.random() * names.length)];
  const n = names.length > 1 && !still() ? REEL : 1;
  const items = [];
  for (let k = 0; k < n - 1; k++) items.push(any());
  items.push(pick.name);
  if (names.length > 1) items.push(any(), any());
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
  if (kept.length) toast(kept.length === 1 ? "One night sorted." : `${kept.length} nights sorted.`);
}

export function initSpin() {
  $("spinBtn").replaceChildren(wheelIcon(), "Spin the wheel");
  $("spinKeep").replaceChildren(checkIcon(), "Keep it");
  $("spinAgain").replaceChildren(againIcon(), "Spin again");
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
