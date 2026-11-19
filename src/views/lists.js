// The profile tab: who you are, your lists, and (in the page markup) the theme. Its tab button
// shows your avatar. Sign-in and sharing only appear when Firebase is configured. The tab is
// built when it is shown so a sync echo never wipes what you're typing.
import { $, el, editIcon, toast, userIcon } from "../dom.js";
import { state, setName } from "../state.js";
import { confirmSheet } from "../dialogs.js";
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

const open = () => !$("profile").hidden;
// once something on the profile tab is done, get out of the way
const leave = () => showTab("week");

export function initLists(a) {
  api = a;
  renderProfile();
  if (open()) fillAccount();
}
export function initAccount() {
  renderProfile();
  onTab((t) => t === "profile" && fillAccount());
  if (open()) fillAccount();
}

export function renderProfile() {
  const acct = api && api.account();
  const who = acct ? acct.name : "Guest";
  const changed = $("acctBtn").dataset.who && $("acctBtn").dataset.who !== who;
  avatar($("acctBtn"), acct);
  $("acctBtn").dataset.who = who;
  $("t-profile").title = acct ? `Signed in as ${acct.name}` : "";
  // signed in or out while the tab is showing: it has to say so
  if (changed && open()) fillAccount();
}

// Show the profile tab with a reason on top, e.g. a guest landing on an invite link.
export function promptSignIn(lead) {
  if (!open()) showTab("profile");
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

/* ---------- signed out ---------- */

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
    el("h3", {}, "This list"),
    nameField(),
    el("p", { class: "muted" }, "Saved on this device. Sign in to share it or use it on another device."),
  ];
}

/* ---------- signed in ---------- */

function accountBlock(acct) {
  const pic = el("span", { class: "avatar", "aria-hidden": "true" });
  avatar(pic, acct);
  return [
    el(
      "div",
      { class: "who" },
      pic,
      el("div", {}, el("strong", {}, acct.name), acct.email ? el("small", {}, acct.email) : null),
    ),
    el("button", { class: "btn ghost", onclick: () => busy(() => api.signOutUser().then(() => leave())) }, "Sign out"),
  ];
}

// Emails this list has invited, each with a way to take it back.
function invited() {
  const emails = Object.keys(state.invites).sort();
  if (!emails.length) return null;
  return el(
    "div",
    { class: "others" },
    ...emails.map((e) =>
      el(
        "span",
        { class: "irow" },
        `Invited: ${e}`,
        el(
          "button",
          {
            type: "button",
            "aria-label": `Remove invite for ${e}`,
            onclick: () => busy(() => api.uninvite(e).then(refill)),
          },
          "×",
        ),
      ),
    ),
  );
}

function listsBlock() {
  const members = Object.keys(state.members).length;
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
  const newIn = el("input", {
    class: "lname",
    id: "newListName",
    placeholder: "New list name, e.g. Lake trip",
    "aria-label": "New list name",
    maxlength: "60",
    autocomplete: "off",
  });
  const create = () => {
    const v = newIn.value.trim();
    if (!v) return toast("Name the new list first.");
    busy(async () => {
      leave();
      await api.createList(v);
    });
  };

  // other lists, and whether this is the only one, arrive once their names are read
  const others = el("div", { class: "others" }, el("p", { class: "muted" }, "Loading your lists…"));
  const leaveNote = el("p", { class: "muted" });
  const leaveBtn = el("button", { class: "btn danger leave", id: "leaveList", disabled: "" }, "Leave this list");
  api.names().then((names) => {
    const rest = Object.entries(names).filter(([id]) => id !== api.current);
    others.replaceChildren(
      ...rest.map(([id, name]) =>
        el(
          "button",
          {
            class: "lrow",
            onclick: () =>
              busy(async () => {
                leave();
                await api.switchTo(id);
              }),
          },
          name,
        ),
      ),
    );
    if (!rest.length) others.append(el("p", { class: "muted" }, "You have no other lists."));
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

  return [
    el("h3", {}, "This list"),
    nameField(),
    el(
      "div",
      { class: "stack" },
      el("p", { class: "muted" }, "Share it with someone by email."),
      inviteIn,
      el("button", { class: "btn", id: "inviteBtn", onclick: invite }, "Invite"),
    ),
    invited(),
    el("h3", {}, "Other lists"),
    others,
    el(
      "div",
      { class: "stack" },
      newIn,
      el("button", { class: "btn ghost", id: "newListBtn", onclick: create }, "Create list"),
    ),
    el("h3", {}, "Leave this list"),
    leaveNote,
    leaveBtn,
  ];
}

let lastLead;
const refill = () => fillAccount(lastLead);

function fillAccount(lead = "Sign in to sync across your devices and share lists. Your current lists will be kept.") {
  lastLead = lead;
  const body = $("acctBody");
  if (!api) return body.replaceChildren(el("p", { class: "muted" }, "Everything is saved on this device only."));
  const acct = api.account();
  body.replaceChildren(...(acct ? [...accountBlock(acct), ...listsBlock()] : signInBlock(lead)).filter(Boolean));
}
