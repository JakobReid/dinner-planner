// Profile button (account dialog) and "My lists" button (lists dialog) in the footer. Only wired
// up when sync is on; each dialog is built on open so a sync echo never wipes what you're typing.
import { $, el, toast } from "../dom.js";
import { state, setName } from "../state.js";
import { openDialog, closeDialog } from "../dialogs.js";

let api = null;

export function initLists(a) {
  api = a;
  $("footRow").hidden = false;
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
  $("whoSub").textContent = acct ? "Lists follow you to any device" : "Sign in to keep your lists";
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
      "p",
      { class: "muted" },
      members <= 1 ? "Just you in here." : `${members} people share this list.`,
      " Anyone with the invite link can join.",
    ),
    el(
      "div",
      { class: "r" },
      el("button", { class: "btn", onclick: () => api.share() }, "Invite someone"),
      el(
        "button",
        { class: "btn ghost", onclick: () => busy(() => api.copyList().then(() => closeDialog("listsDlg"))) },
        "Make my own copy",
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
        "Leave",
      ),
    ),
    el("h3", {}, "Your other lists"),
    others,
    el(
      "button",
      {
        class: "btn ghost",
        onclick: () => {
          const name = prompt("Name the new list:", "Lake trip");
          if (name && name.trim())
            busy(async () => {
              closeDialog("listsDlg");
              await api.createList(name.trim());
            });
        },
      },
      "New list",
    ),
  );
}

function fillAccount() {
  const acct = api.account();
  const email = el("input", {
    type: "email",
    class: "lname",
    placeholder: "you@example.com",
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
          "Sign out",
        ),
      )
    : el(
        "div",
        { class: "acct" },
        el("p", { class: "muted" }, "Sign in to keep your lists on every device. Nothing here is lost."),
        el(
          "button",
          { class: "btn", onclick: () => busy(() => api.signInGoogle().then(() => closeDialog("acctDlg"))) },
          "Sign in with Google",
        ),
        el(
          "div",
          { class: "r" },
          email,
          el(
            "button",
            {
              class: "btn ghost",
              onclick: () => {
                const v = email.value.trim();
                if (!v.includes("@")) return toast("Enter your email first.");
                busy(() => api.sendEmailLink(v).then(() => closeDialog("acctDlg")));
              },
            },
            "Email me a link",
          ),
        ),
      );
  $("acctBody").replaceChildren(body);
}
