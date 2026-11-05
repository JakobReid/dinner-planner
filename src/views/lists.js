// Profile button (account dialog) and "My lists" button (lists dialog) in the footer. Only wired
// up when Firebase is configured; guests see a sign-in nudge in place of sharing. Each dialog is
// built on open so a sync echo never wipes what you're typing.
import { $, el, leaveIcon, mailIcon, plusIcon, shareIcon, toast, userIcon } from "../dom.js";
import { state, setName } from "../state.js";
import { openDialog, closeDialog } from "../dialogs.js";

let api = null;

export function initLists(a) {
  api = a;
  $("acctBtn").hidden = false;
  $("listsBtn").hidden = false;
  renderProfile();
  $("listsBtn").onclick = () => {
    fillLists();
    openDialog("listsDlg");
  };
  $("acctBtn").onclick = () => {
    fillAccount();
    openDialog("acctDlg");
  };
}

export function renderProfile() {
  if (!api) return;
  const acct = api.account();
  $("whoName").textContent = acct ? acct.name : "Guest";
  // Google gives a photo; email sign-ins and guests get a blank disc
  $("whoPic").style.backgroundImage = acct && acct.photo ? `url("${acct.photo}")` : "";
  $("whoSub").textContent = acct ? "Signed in" : "Sign in to sync and share";
}

// Open the account dialog with a reason on top, e.g. a guest landing on an invite link.
export function promptSignIn(lead) {
  closeDialog("listsDlg");
  fillAccount(lead);
  openDialog("acctDlg");
}

const busy = async (fn) => {
  try {
    await fn();
  } catch {
    toast("That didn’t work. Check your connection and try again.");
  }
};

function fillLists() {
  const box = $("listsBody");
  const members = Object.keys(state.members).length;
  const nameIn = el("input", { class: "lname", value: state.name, maxlength: "60", "aria-label": "List name" });
  nameIn.onchange = () => {
    setName(nameIn.value);
    nameIn.value = state.name;
  };
  if (!api.account()) {
    box.replaceChildren(
      el("h3", {}, "This list"),
      nameIn,
      el("p", { class: "muted" }, "It lives on this device. Sign in to share it or use it on another device."),
      el(
        "button",
        { class: "btn", onclick: () => promptSignIn("Sign in to share this list and sync it to your other devices.") },
        userIcon(),
        "Sign in",
      ),
    );
    return;
  }
  const others = el("div", { class: "others" });
  api.names().then((names) => {
    others.replaceChildren(
      ...Object.entries(names)
        .filter(([id]) => id !== api.current)
        .map(([id, name]) =>
          el(
            "button",
            {
              class: "lrow",
              onclick: () =>
                busy(async () => {
                  closeDialog("listsDlg");
                  await api.switchTo(id);
                }),
            },
            name,
          ),
        ),
    );
    if (!others.children.length) others.append(el("p", { class: "muted" }, "Just this one so far."));
  });
  box.replaceChildren(
    el("h3", {}, "This list"),
    nameIn,
    el(
      "div",
      { class: "r" },
      el(
        "button",
        {
          class: "btn",
          onclick: () => {
            const v = (prompt("Their email address:") || "").trim();
            if (!v) return;
            if (!v.includes("@")) return toast("That doesn’t look like an email address.");
            busy(async () => {
              await api.invite(v);
              toast(`Invited ${v.toLowerCase()}. The list shows up when they sign in with that email.`);
              fillLists();
            });
          },
        },
        shareIcon(),
        "Invite someone",
      ),
      el(
        "button",
        {
          class: "btn danger",
          onclick: () => {
            const msg =
              members <= 1
                ? `Leave and delete “${state.name}”? Its meals and weeks go with it.`
                : `Leave “${state.name}”? The others keep it; you can rejoin with an invite link.`;
            if (confirm(msg)) busy(() => api.leaveList().then(() => closeDialog("listsDlg")));
          },
        },
        leaveIcon(),
        "Leave",
      ),
    ),
    ...invitesBlock(),
    el("h3", {}, "Your other lists"),
    others,
    el(
      "button",
      {
        class: "btn",
        onclick: () => {
          const name = prompt("Name the new list:", "Lake trip");
          if (name && name.trim())
            busy(async () => {
              closeDialog("listsDlg");
              await api.createList(name.trim());
            });
        },
      },
      plusIcon(),
      "New list",
    ),
  );
}

// Google's four-colour G, inline so it works offline.
function googleMark() {
  const span = el("span", { class: "g", "aria-hidden": "true" });
  span.innerHTML =
    '<svg viewBox="0 0 48 48"><path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.5 5.4 2.6 13.3l7.9 6.1C12.4 13.7 17.7 9.5 24 9.5z"/><path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.3 5.5-4.8 7.2l7.7 6c4.5-4.2 6.9-10.3 6.9-17.7z"/><path fill="#FBBC05" d="M10.5 28.6A14.5 14.5 0 0 1 9.7 24c0-1.6.3-3.1.8-4.6l-7.9-6.1A24 24 0 0 0 0 24c0 3.9.9 7.5 2.6 10.7l7.9-6.1z"/><path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.7-6c-2.1 1.4-4.9 2.3-8.2 2.3-6.3 0-11.6-4.2-13.5-10l-7.9 6.1C6.5 42.6 14.6 48 24 48z"/></svg>';
  return span;
}

// Emails this list has invited, each with a way to take it back.
function invitesBlock() {
  const emails = Object.keys(state.invites).sort();
  if (!emails.length) return [];
  return [
    el("h3", {}, "Invited"),
    el(
      "div",
      { class: "others" },
      ...emails.map((e) =>
        el(
          "span",
          { class: "irow" },
          e,
          el(
            "button",
            {
              type: "button",
              "aria-label": `Remove ${e}`,
              onclick: () => busy(() => api.uninvite(e).then(fillLists)),
            },
            "×",
          ),
        ),
      ),
    ),
  ];
}

function fillAccount(
  lead = "Sign in to sync across your devices and share lists. What’s on this device comes with you.",
) {
  const acct = api.account();
  const email = el("input", {
    type: "email",
    class: "lname",
    placeholder: "Your email",
    "aria-label": "Email address",
    autocomplete: "email",
  });
  const body = acct
    ? el(
        "div",
        { class: "acct" },
        el("p", { class: "muted" }, `Signed in as ${acct.email || acct.name}. Your lists follow you to any device.`),
        el(
          "button",
          { class: "btn ghost", onclick: () => busy(() => api.signOutUser().then(() => closeDialog("acctDlg"))) },
          leaveIcon(),
          "Sign out",
        ),
      )
    : el(
        "div",
        { class: "acct" },
        el("p", { class: "muted" }, lead),
        el(
          "button",
          { class: "btn google", onclick: () => busy(() => api.signInGoogle().then(() => closeDialog("acctDlg"))) },
          googleMark(),
          "Sign in with Google",
        ),
        el("span", { class: "or" }, "or"),
        el(
          "div",
          { class: "group" },
          email,
          el(
            "button",
            {
              class: "btn",
              onclick: () => {
                const v = email.value.trim();
                if (!v.includes("@")) return toast("Enter your email first.");
                busy(() => api.sendEmailLink(v).then(() => closeDialog("acctDlg")));
              },
            },
            mailIcon(),
            "Email me a link",
          ),
        ),
      );
  $("acctBody").replaceChildren(body);
}
