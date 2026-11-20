// The Settings tab: your account, this list, the people on it, its meal times, the theme (in the
// page markup, see settings.js) and leaving. Sign-in and sharing only appear when Firebase is
// configured. The tab is built when it is shown so a sync echo never wipes what you're typing.
import { $, el, closeIcon, downIcon, editIcon, nextIcon, toast, upIcon, userIcon } from "../dom.js";
import {
  state,
  people,
  setName,
  addMealTime,
  renameMealTime,
  moveMealTime,
  deleteMealTime,
  plannedCount,
  setWhoPlans,
  restoreWhoPlans,
} from "../state.js";
import { render } from "../render.js";
import { confirmSheet, openDialog, closeDialog } from "../dialogs.js";
import { showTab, onTab } from "./tabs.js";

let api = null;

export const initials = (name) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join("");

// The avatar: a photo if Google gave one, otherwise initials; guests get a person outline.
function avatar(node, acct) {
  node.style.backgroundImage = acct && acct.photo ? `url("${acct.photo}")` : "";
  node.replaceChildren(acct ? (acct.photo ? "" : initials(acct.name)) : userIcon());
}

const open = () => !$("settings").hidden;
// once something in Settings is done, get out of the way
const leave = () => showTab("week");
// Sharing needs sync: without it there is nobody to invite.
export const canInvite = () => !!api;

export function initLists(a) {
  api = a;
  renderProfile();
  if (open()) fillAccount();
  render(); // the Week tab offers an invite once there is somewhere to send one
}
export function initAccount() {
  renderProfile();
  onTab((t) => t === "settings" && fillSettings());
  if (open()) fillSettings();
}

// Open Settings at one of its sections, e.g. from the + beside the meal time tabs.
export function goSettings(headingId) {
  if (!open()) showTab("settings");
  const h = $(headingId) || $("settings");
  h.scrollIntoView({ block: "start" });
}

export function renderProfile() {
  const acct = api && api.account();
  const who = acct ? acct.name : "Guest";
  const tab = $("t-settings");
  const changed = tab.dataset.who && tab.dataset.who !== who;
  tab.dataset.who = who;
  tab.title = acct ? `Signed in as ${acct.name}` : "";
  // signed in or out while the tab is showing: it has to say so
  if (changed && open()) fillSettings();
}

// Show Settings with a reason on top, e.g. a guest landing on an invite link.
export function promptSignIn(lead) {
  if (!open()) showTab("settings");
  fillAccount(lead);
}

const busy = async (fn) => {
  try {
    await fn();
  } catch {
    toast("That didn’t work. Check your connection and try again.");
  }
};

// The list's name is a field: type over it and it saves when you leave the field.
function nameField() {
  const input = el("input", { class: "lname", value: state.name, maxlength: "60", "aria-label": "List name" });
  input.onchange = () => {
    const before = state.name;
    setName(input.value);
    input.value = state.name;
    if (state.name !== before) toast(`List renamed to ${state.name}.`);
  };
  return el("div", { class: "nameedit" }, input, editIcon());
}

// Google's four-colour G, inline so it works offline.
function googleMark() {
  const span = el("span", { class: "g", "aria-hidden": "true" });
  span.innerHTML =
    '<svg viewBox="0 0 48 48"><path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.5 5.4 2.6 13.3l7.9 6.1C12.4 13.7 17.7 9.5 24 9.5z"/><path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.3 5.5-4.8 7.2l7.7 6c4.5-4.2 6.9-10.3 6.9-17.7z"/><path fill="#FBBC05" d="M10.5 28.6A14.5 14.5 0 0 1 9.7 24c0-1.6.3-3.1.8-4.6l-7.9-6.1A24 24 0 0 0 0 24c0 3.9.9 7.5 2.6 10.7l7.9-6.1z"/><path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.7-6c-2.1 1.4-4.9 2.3-8.2 2.3-6.3 0-11.6-4.2-13.5-10l-7.9 6.1C6.5 42.6 14.6 48 24 48z"/></svg>';
  return span;
}

const block = (...kids) => el("div", { class: "lists" }, ...kids);

/* ---------- account: signed out ---------- */

function signInBlock(lead) {
  const email = el("input", {
    type: "email",
    class: "lname",
    id: "acctEmail",
    placeholder: "Your email",
    "aria-label": "Email address",
    autocomplete: "email",
  });
  const link = el("input", {
    class: "lname",
    id: "acctLink",
    placeholder: "Paste the sign-in link",
    "aria-label": "Sign-in link from the email",
    autocomplete: "off",
  });
  // A home-screen app can't receive the emailed link (it opens in the browser, which has its own
  // storage), so the link can be pasted here instead.
  const paste = el(
    "details",
    { id: "acctPaste" },
    el("summary", {}, "Link opened somewhere else?"),
    el(
      "div",
      { class: "stack" },
      el("p", { class: "muted" }, "In the email, press and hold the link, copy it, then paste it here."),
      link,
      el(
        "button",
        {
          class: "btn ghost",
          onclick: () => {
            const v = link.value.trim();
            if (!v) return toast("Paste the link from the email first.");
            busy(async () => {
              if (await api.signInWithLink(email.value.trim(), v)) leave();
            });
          },
        },
        "Sign in with this link",
      ),
    ),
  );
  return [
    block(
      el("p", { class: "muted" }, lead),
      el(
        "button",
        { class: "btn google", onclick: () => busy(() => api.signInGoogle().then(() => leave())) },
        googleMark(),
        "Sign in with Google",
      ),
      el("span", { class: "or" }, "or"),
      el(
        "div",
        { class: "stack" },
        email,
        el(
          "button",
          {
            class: "btn",
            onclick: () => {
              const v = email.value.trim();
              if (!v.includes("@")) return toast("Enter your email first.");
              busy(async () => {
                if (await api.sendEmailLink(v)) paste.open = true;
              });
            },
          },
          "Email me a link",
        ),
      ),
      paste,
    ),
    block(
      el("h2", {}, "This list"),
      nameField(),
      el("p", { class: "muted" }, "Saved on this device. Sign in to share it or use it on another device."),
    ),
  ];
}

/* ---------- account: signed in ---------- */

function accountBlock(acct) {
  const pic = el("span", { class: "avatar", "aria-hidden": "true" });
  avatar(pic, acct);
  return el(
    "div",
    { class: "who" },
    pic,
    el("div", {}, el("strong", {}, acct.name), acct.email ? el("small", {}, acct.email) : null),
    el("button", { class: "btn ghost", onclick: () => busy(() => api.signOutUser().then(() => leave())) }, "Sign out"),
  );
}

// This list: its name, and a way to another list or a new one.
function listBlock() {
  return block(
    el("h2", {}, "This list"),
    nameField(),
    el("button", { class: "linkrow", id: "switchList", onclick: openLists }, "Switch or create a list", nextIcon()),
  );
}

// Your other lists and "create a list", in a sheet so Settings stays about the list you're on.
function openLists() {
  const newIn = el("input", {
    class: "lname",
    id: "newListName",
    placeholder: "New list name, e.g. Lake trip",
    "aria-label": "New list name",
    maxlength: "60",
    autocomplete: "off",
  });
  const go = (fn) =>
    busy(async () => {
      closeDialog("listsDlg");
      leave();
      await fn();
    });
  const create = () => {
    const v = newIn.value.trim();
    if (!v) return toast("Name the new list first.");
    go(() => api.createList(v));
  };
  const others = el("div", { class: "others" }, el("p", { class: "muted" }, "Loading your lists…"));
  otherLists().then((rest) => {
    others.replaceChildren(
      ...rest.map(([id, name]) => el("button", { class: "lrow", onclick: () => go(() => api.switchTo(id)) }, name)),
    );
    if (!rest.length) others.append(el("p", { class: "muted" }, "You have no other lists."));
  });
  $("listsBody").replaceChildren(
    el("h3", {}, "Other lists"),
    others,
    el("h3", {}, "Create a list"),
    el(
      "div",
      { class: "stack" },
      newIn,
      el("button", { class: "btn ghost", id: "newListBtn", onclick: create }, "Create list"),
    ),
  );
  openDialog("listsDlg");
}
// Your lists other than this one, as [id, name]; they arrive once their names are read.
const otherLists = () => api.names().then((names) => Object.entries(names).filter(([id]) => id !== api.current));

// Who shares the list: members, the emails invited but not here yet, and a field to invite another.
function peopleBlock() {
  const inviteIn = el("input", {
    type: "email",
    class: "lname",
    id: "inviteEmail",
    placeholder: "Their email",
    "aria-label": "Email address to invite",
    autocomplete: "off",
  });
  const invite = () => {
    const v = inviteIn.value.trim();
    if (!v.includes("@")) return toast("Enter their email address first.");
    busy(async () => {
      await api.invite(v);
      toast(`Invited ${v.toLowerCase()}. They will see this list when they sign in with that email.`);
      refill();
    });
  };
  return block(
    el("h2", { id: "peopleHead" }, "People"),
    el("p", { class: "muted" }, "Anyone you invite can see and edit this list."),
    el(
      "div",
      { class: "card" },
      ...people().map((p) =>
        el(
          "div",
          { class: "prow" },
          el("span", { class: "avatar", "aria-hidden": "true" }, initials(p.name)),
          el("span", { class: "two" }, el("strong", {}, p.name), el("small", {}, p.you ? "You" : "Member")),
        ),
      ),
      ...Object.keys(state.invites)
        .sort()
        .map((e) =>
          el(
            "div",
            { class: "prow irow" },
            el("span", { class: "avatar pending", "aria-hidden": "true" }),
            el("span", { class: "two" }, el("strong", {}, e), el("small", {}, "Invited, not joined yet")),
            el(
              "button",
              {
                type: "button",
                class: "x",
                "aria-label": `Cancel invite for ${e}`,
                onclick: () => busy(() => api.uninvite(e).then(refill)),
              },
              closeIcon(),
            ),
          ),
        ),
      el(
        "div",
        { class: "addrow" },
        inviteIn,
        el("button", { class: "btn", id: "inviteBtn", onclick: invite }, "Invite"),
      ),
    ),
  );
}

// Leaving: blocked while this is your only list, and it says what happens to the list.
function fillLeave() {
  const box = $("leaveBody");
  box.hidden = !(api && api.account());
  if (box.hidden) return box.replaceChildren();
  const members = Object.keys(state.members).length;
  const leaveNote = el("p", { class: "muted" });
  const leaveBtn = el("button", { class: "btn danger leave", id: "leaveList", disabled: "" }, "Leave this list");
  otherLists().then((rest) => {
    // leaving your only list would leave you with nothing, so it is blocked
    if (!rest.length) {
      leaveNote.textContent = "This is your only list, so you can’t leave it. Create another list first.";
      return;
    }
    leaveBtn.disabled = false;
    leaveNote.textContent =
      members <= 1
        ? "You are the only person on this list. Leaving deletes it, with its meals and weeks."
        : "Leaving takes this list off your account. The others keep it, and can invite you back.";
  });
  leaveBtn.onclick = async () => {
    const yes = await confirmSheet({
      title: `Leave ${state.name}?`,
      message:
        members <= 1
          ? "Nobody else is on this list, so it will be deleted along with its meals and weeks."
          : "You will lose access to it. The others keep it and can invite you back.",
      ok: members <= 1 ? "Leave and delete" : "Leave list",
    });
    if (yes) busy(() => api.leaveList().then(() => leave()));
  };
  box.replaceChildren(el("h2", {}, "Leave this list"), leaveNote, leaveBtn);
}

/* ---------- meal times ---------- */

let openTime = null; // the meal time whose row is open

const kind = (t) => (t.each ? "Each person" : "Shared");
const days = (n) => (n === 1 ? "1 planned day" : `${n} planned days`);

// Meal times changed: the Week tab's tabs and the shopping list follow.
function timesChanged() {
  fillTimes();
  render();
}

// Shared or each person. Whoever switches keeps their plan; going shared would drop what the
// others planned, so that asks first. Either way the toast can put it back.
async function switchWho(t, each) {
  if (t.each === each) return;
  const lost = each ? 0 : plannedCount(t.id, { others: true });
  if (lost) {
    const yes = await confirmSheet({
      title: `Share ${t.name}?`,
      message: `Your plan becomes the one plan for everyone. ${days(lost)} from other people will be removed.`,
      ok: "Make it shared",
    });
    if (!yes) return;
  }
  const undo = setWhoPlans(t.id, each);
  timesChanged();
  toast(each ? `${t.name} is now planned per person.` : `${t.name} is now shared.`, {
    label: "Undo",
    fn: () => {
      restoreWhoPlans(undo);
      timesChanged();
    },
  });
}

async function removeTime(t) {
  const n = plannedCount(t.id);
  if (n) {
    const yes = await confirmSheet({
      title: `Delete ${t.name}?`,
      message: `${days(n)} will be removed from your weeks. The meals stay in your list of meals.`,
      ok: "Delete meal time",
    });
    if (!yes) return;
  }
  deleteMealTime(t.id);
  openTime = null;
  timesChanged();
  toast(`Deleted ${t.name}.`);
}

function timeRow(t, i) {
  const isOpen = openTime === t.id;
  const head = el(
    "button",
    {
      type: "button",
      class: "trow",
      "aria-expanded": String(isOpen),
      "data-time": t.id,
      onclick: () => {
        openTime = isOpen ? null : t.id;
        fillTimes();
      },
    },
    el("span", { class: "two" }, el("strong", {}, t.name), el("small", {}, kind(t))),
    nextIcon(),
  );
  if (!isOpen) return el("div", { class: "time" }, head);

  const name = el("input", { class: "lname", value: t.name, maxlength: "30", autocomplete: "off" });
  name.onchange = () => {
    if (renameMealTime(t.id, name.value)) timesChanged();
    else name.value = t.name;
  };
  const seg = (label, each) =>
    el("button", { type: "button", "aria-pressed": String(t.each === each), onclick: () => switchWho(t, each) }, label);
  const move = (label, by, icon) =>
    el(
      "button",
      {
        type: "button",
        class: "iconbtn line",
        "aria-label": label,
        onclick: () => {
          moveMealTime(t.id, by);
          timesChanged();
        },
      },
      icon,
    );
  const last = state.mealTimes.length - 1;
  return el(
    "div",
    { class: "time" },
    head,
    el(
      "div",
      { class: "tbody" },
      el("label", { class: "fld" }, "Name", name),
      el(
        "div",
        { class: "fld" },
        el("span", { id: `who-${t.id}` }, "Who plans it"),
        el(
          "div",
          { class: "seg", role: "group", "aria-labelledby": `who-${t.id}` },
          seg("Shared", false),
          seg("Each person", true),
        ),
      ),
      el(
        "div",
        { class: "tfoot" },
        el(
          "span",
          { class: "moves" },
          i > 0 ? move(`Move ${t.name} up`, -1, upIcon()) : null,
          i < last ? move(`Move ${t.name} down`, 1, downIcon()) : null,
        ),
        // a list always has at least one meal time
        last > 0 ? el("button", { class: "btn danger", onclick: () => removeTime(t) }, "Delete meal time") : null,
      ),
    ),
  );
}

function fillTimes() {
  const input = el("input", {
    class: "lname",
    id: "newTime",
    placeholder: "New meal time, e.g. Morning tea",
    "aria-label": "New meal time",
    maxlength: "30",
    autocomplete: "off",
  });
  const add = () => {
    const id = addMealTime(input.value);
    if (!id) return toast("Name the meal time first.");
    openTime = id;
    timesChanged();
  };
  input.addEventListener("keydown", (e) => e.key === "Enter" && add());
  $("timesBody").replaceChildren(
    el("h2", { id: "timesHead" }, "Meal times"),
    el("p", { class: "muted" }, "Shared means one meal for everyone. Each person means everyone picks their own."),
    el(
      "div",
      { class: "card" },
      ...state.mealTimes.map(timeRow),
      el("div", { class: "addrow" }, input, el("button", { class: "btn ghost", id: "addTime", onclick: add }, "Add")),
    ),
  );
}

/* ---------- the tab ---------- */

let lastLead;
const refill = () => fillAccount(lastLead);

function fillSettings() {
  openTime = null; // coming back to the tab, the meal times are all closed
  fillAccount();
  fillTimes();
}

function fillAccount(lead = "Sign in to sync across your devices and share lists. Your current lists will be kept.") {
  lastLead = lead;
  const body = $("acctBody");
  fillLeave();
  if (!api) return body.replaceChildren(el("p", { class: "muted" }, "Everything is saved on this device only."));
  const acct = api.account();
  body.replaceChildren(...(acct ? [accountBlock(acct), listBlock(), peopleBlock()] : signInBlock(lead)));
}
