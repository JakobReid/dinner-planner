// Household sync over Firestore. One document per household, a members map on each, and a
// users/{uid} doc naming the households you're in and the one you had open last. Guests keep
// everything on this device; signing in with Google or an email link turns on sync and sharing,
// and a first sign-in seeds your Home list from what's on the device. Writes are field-level
// merges through the offline cache. Without Firebase config the app runs on this device only.
import { initializeApp } from "firebase/app";
import {
  GoogleAuthProvider,
  connectAuthEmulator,
  getAuth,
  getRedirectResult,
  isSignInWithEmailLink,
  onAuthStateChanged,
  sendSignInLinkToEmail,
  signInWithEmailLink,
  signInWithPopup,
  signInWithRedirect,
  signOut,
} from "firebase/auth";
import {
  connectFirestoreEmulator,
  deleteDoc,
  deleteField,
  doc,
  getDoc,
  initializeFirestore,
  onSnapshot,
  persistentLocalCache,
  persistentMultipleTabManager,
  setDoc,
  updateDoc,
} from "firebase/firestore";
import { $, toast } from "./dom.js";
import { DEL, replaceState, setRemote, state, toDoc } from "./state.js";
import { render } from "./render.js";
import { initLists, promptSignIn, renderProfile } from "./views/lists.js";

const config = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

let auth = null;
let db = null;
let uid = null;
let current = null; // household code in use on this device
let unsub = null;
let user = { households: {}, current: null };

// Footer line: silent when all is well, a short note when saving, offline or local-only.
const status = (t, state = t ? "warn" : "ok") => {
  $("sync").textContent = t;
  $("sync").dataset.state = state;
};
const local = {
  get: (k) => {
    try {
      return localStorage.getItem(k);
    } catch {
      return null;
    }
  },
  set: (k, v) => {
    try {
      if (v == null) localStorage.removeItem(k);
      else localStorage.setItem(k, v);
    } catch {
      /* ignore */
    }
  },
};

function randomCode() {
  const a = new Uint8Array(16);
  crypto.getRandomValues(a);
  return [...a]
    .map((b) => b.toString(36).padStart(2, "0"))
    .join("")
    .slice(0, 24);
}

// The code in the URL doubles as the invite link, so keep it in step with the list in use.
function setUrlCode(code) {
  const u = new URL(location.href);
  if (u.searchParams.get("h") === code) return;
  if (code) u.searchParams.set("h", code);
  else u.searchParams.delete("h");
  history.replaceState(null, "", u.pathname + u.search + location.hash);
}
const urlCode = () => new URL(location.href).searchParams.get("h");

// State patches use DEL for removals; Firestore wants its own sentinel.
const toFields = (v) => {
  if (v === DEL) return deleteField();
  if (Array.isArray(v)) return v.map(toFields);
  if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, toFields(x)]));
  return v;
};

const hhRef = (id) => doc(db, "households", id);
const userRef = () => doc(db, "users", uid);
const saveFail = () => toast("Couldn’t save to the shared plan. Changes are kept on this device.");
const write = (ref, data) => setDoc(ref, toFields(data), { merge: true });
const saveUser = (patch) => write(userRef(), patch).catch(() => {});

// A brand-new document for this user, seeded from `data` (the document shape, no members).
const fresh = (data, name) => ({ ...data, name, members: { [uid]: true } });
const empty = () => ({ meals: {}, weeks: {}, aisles: {} });

/* ---------- which household ---------- */

// Signed out: keep the last list as a local copy and stop syncing.
function detach() {
  if (unsub) unsub();
  unsub = null;
  setRemote(null);
  uid = null;
  current = null;
  user = { households: {}, current: null };
  status("");
}

// Called whenever the signed-in user changes: work out which household to show and subscribe.
async function attach(u) {
  uid = u.uid;
  if (unsub) unsub();
  unsub = null;
  try {
    const snap = await getDoc(userRef());
    user = snap.exists() ? { households: {}, current: null, ...snap.data() } : { households: {}, current: null };
  } catch {
    user = { households: {}, current: null };
  }
  let code = urlCode() || local.get("household");
  if (code && !user.households[code]) {
    // an invite link, or the list this device was on before signing in: add yourself
    await write(hhRef(code), { members: { [uid]: true } });
  } else if (!code) code = user.current;
  if (!code) {
    // first sign-in: what's on this device becomes your Home list
    code = randomCode();
    await setDoc(hhRef(code), toFields(fresh(toDoc(state), "Home")));
  }
  await open(code);
}

async function open(code) {
  current = code;
  local.set("household", code);
  setUrlCode(code);
  user.households[code] = true;
  user.current = code;
  saveUser({ households: { [code]: true }, current: code });
  subscribe();
}

function subscribe() {
  if (unsub) unsub();
  const ref = hhRef(current);
  setRemote((data) => write(ref, data).catch(saveFail));
  unsub = onSnapshot(
    ref,
    { includeMetadataChanges: true },
    (snap) => {
      const { hasPendingWrites, fromCache } = snap.metadata;
      // our own writes are already in state; the server echo arrives once they land
      if (hasPendingWrites) {
        status("Saving…", "busy");
        return;
      }
      status(fromCache ? "Offline copy. Changes sync when you’re back online." : "");
      const data = snap.exists() ? snap.data() : {};
      // a document with nothing in it yet (joined by a fresh link) gets this device's meals
      if (!("meals" in data) && !("weeks" in data) && !("aisles" in data)) {
        if (!fromCache) write(ref, { ...toDoc(state), name: data.name || "Home" }).catch(saveFail);
        return;
      }
      replaceState(data);
      render();
      // older documents kept meals as an array; the rules now want the map
      if (Array.isArray(data.meals)) write(ref, { meals: toDoc(state).meals }).catch(saveFail);
    },
    () => status("Couldn’t reach this list. Saving on this device for now."),
  );
}

/* ---------- lists ---------- */

const api = {
  get current() {
    return current;
  },
  get lists() {
    return Object.keys(user.households);
  },
  account() {
    const u = auth && auth.currentUser;
    if (!u) return null;
    return { email: u.email || "", name: u.displayName || u.email || "Signed in" };
  },
  // Names of your lists, read live so renames by others show up; lists you can't read any more drop out.
  async names() {
    const out = {};
    await Promise.all(
      Object.keys(user.households).map(async (id) => {
        try {
          const snap = await getDoc(hhRef(id));
          if (snap.exists()) out[id] = snap.data().name || "Home";
        } catch {
          /* no longer a member, or deleted */
        }
      }),
    );
    for (const id of Object.keys(user.households)) if (!(id in out) && id !== current) delete user.households[id];
    return out;
  },
  async switchTo(id) {
    if (id === current) return;
    replaceState({ name: "", meals: [], weeks: {}, aisles: {} });
    render();
    await open(id);
  },
  async createList(name) {
    const id = randomCode();
    await setDoc(hhRef(id), toFields(fresh(empty(), name || "New list")));
    await api.switchTo(id);
  },
  async copyList() {
    const id = randomCode();
    await setDoc(hhRef(id), toFields(fresh(toDoc(state), `${state.name} copy`)));
    await api.switchTo(id);
  },
  // Leaving removes you; the last one out deletes the list. You land on another list, or a new Home.
  async leaveList() {
    const id = current;
    if (unsub) unsub();
    unsub = null;
    setRemote(null);
    const others = Object.keys(state.members).filter((m) => m !== uid);
    if (others.length) await updateDoc(hhRef(id), { [`members.${uid}`]: deleteField() });
    else await deleteDoc(hhRef(id));
    delete user.households[id];
    await saveUser({ households: { [id]: DEL } });
    replaceState({ name: "", meals: [], weeks: {}, aisles: {} });
    render();
    const next = Object.keys(user.households)[0];
    if (next) await open(next);
    else {
      const code = randomCode();
      await setDoc(hhRef(code), toFields(fresh(empty(), "Home")));
      await open(code);
    }
  },
  async share() {
    const u = new URL(location.href);
    u.hash = "";
    u.searchParams.set("h", current);
    const link = u.toString();
    try {
      if (navigator.share) {
        await navigator.share({ title: `${state.name} on I feel like dinner tonight`, url: link });
        return;
      }
    } catch (e) {
      if (e && e.name === "AbortError") return;
    }
    try {
      await navigator.clipboard.writeText(link);
      toast("Link copied. Anyone who opens it joins this list.");
    } catch {
      prompt("Copy this link:", link);
    }
  },

  /* ---------- account ---------- */
  async signInGoogle() {
    const provider = new GoogleAuthProvider();
    try {
      await signInWithPopup(auth, provider);
      toast("Signed in. Your lists now follow you to any device.");
    } catch (e) {
      if (e.code === "auth/popup-blocked" || e.code === "auth/operation-not-supported-in-this-environment") {
        await signInWithRedirect(auth, provider);
      } else if (e.code !== "auth/popup-closed-by-user" && e.code !== "auth/cancelled-popup-request") {
        toast("Couldn’t sign in with Google.");
      }
    }
  },
  async sendEmailLink(email) {
    const u = new URL(location.href);
    u.hash = "";
    if (current) u.searchParams.set("h", current);
    try {
      await sendSignInLinkToEmail(auth, email, { url: u.toString(), handleCodeInApp: true });
      local.set("emailForSignIn", email);
      toast(`Sign-in link sent to ${email}. Open it on this device.`);
    } catch {
      toast("Couldn’t send the link. Check the address and try again.");
    }
  },
  async signOutUser() {
    // the next person on this device starts fresh rather than inheriting the list
    local.set("household", null);
    setUrlCode(null);
    await signOut(auth);
  },
};

// Finish a Google redirect or an email link if we landed here from one.
async function finishSignIn() {
  await getRedirectResult(auth).catch(() => toast("Couldn’t sign in with Google."));
  if (!isSignInWithEmailLink(auth, location.href)) return;
  const email = local.get("emailForSignIn") || prompt("Confirm your email to finish signing in:");
  if (!email) return;
  try {
    await signInWithEmailLink(auth, email, location.href);
    toast("Signed in. Your lists now follow you to any device.");
  } catch {
    toast("That sign-in link didn’t work. Ask for a new one.");
  }
  local.set("emailForSignIn", null);
  const u = new URL(location.href);
  ["apiKey", "oobCode", "mode", "lang", "continueUrl"].forEach((k) => u.searchParams.delete(k));
  history.replaceState(null, "", u.pathname + u.search + location.hash);
}

export async function initSync() {
  if (!config.apiKey) {
    status("Saved on this device only.");
    return;
  }
  try {
    const app = initializeApp(config);
    auth = getAuth(app);
    db = initializeFirestore(app, {
      localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
    });
    if (import.meta.env.VITE_FIREBASE_EMULATOR) {
      connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
      connectFirestoreEmulator(db, "127.0.0.1", 8080);
    }
    await auth.authStateReady();
    await finishSignIn();
    initLists(api);
    onAuthStateChanged(auth, (u) => {
      if (!u) {
        detach();
        // a guest opening an invite link: the code stays in the URL and is picked up after sign-in
        if (urlCode()) promptSignIn("You’ve been invited to a list. Sign in to join it.");
      } else if (u.uid !== uid)
        attach(u).catch(() => status("Couldn’t reach this list. Saving on this device for now."));
      renderProfile();
    });
  } catch {
    status("Couldn’t reach the shared plan. Saving on this device for now.");
  }
}
