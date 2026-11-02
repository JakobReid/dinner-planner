// Household sync over Firestore. One document per household; the code in the link is the key.
// Writes are field-level merges queued through the offline cache, so the app works without signal
// and two phones editing different things never overwrite each other. Without Firebase config the
// app runs on this device only.
import { initializeApp } from "firebase/app";
import { connectAuthEmulator, getAuth, signInAnonymously } from "firebase/auth";
import {
  connectFirestoreEmulator,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  doc,
  setDoc,
  deleteField,
  onSnapshot,
} from "firebase/firestore";
import { $, toast } from "./dom.js";
import { DEL, replaceState, setRemote, state, toDoc } from "./state.js";
import { render } from "./render.js";

const config = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

function randomCode() {
  const a = new Uint8Array(16);
  crypto.getRandomValues(a);
  return [...a]
    .map((b) => b.toString(36).padStart(2, "0"))
    .join("")
    .slice(0, 24);
}

// From the link, else the one this device joined, else a fresh one; always reflected back into the URL.
function householdCode() {
  const u = new URL(location.href);
  let h = u.searchParams.get("h");
  if (!h) {
    try {
      h = localStorage.getItem("household");
    } catch {
      /* ignore */
    }
  }
  if (!h) h = randomCode();
  try {
    localStorage.setItem("household", h);
  } catch {
    /* ignore */
  }
  if (u.searchParams.get("h") !== h) {
    u.searchParams.set("h", h);
    history.replaceState(null, "", u.pathname + u.search + location.hash);
  }
  return h;
}

async function share() {
  const u = new URL(location.href);
  u.hash = "";
  const link = u.toString();
  try {
    if (navigator.share) {
      await navigator.share({ title: "I feel like dinner tonight", url: link });
      return;
    }
  } catch (e) {
    if (e && e.name === "AbortError") return;
  }
  try {
    await navigator.clipboard.writeText(link);
    toast("Link copied. Send it to whoever you plan dinners with.");
  } catch {
    prompt("Copy this link:", link);
  }
}

// State patches use DEL for removals; Firestore wants its own sentinel.
const toFields = (v) => {
  if (v === DEL) return deleteField();
  if (Array.isArray(v)) return v.map(toFields);
  if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, toFields(x)]));
  return v;
};

export async function initSync() {
  const status = $("sync");
  if (!config.apiKey) {
    status.textContent = "Saved on this device only.";
    return;
  }
  const fail = () => (status.textContent = "Couldn’t reach the shared plan. Saving on this device for now.");
  let ref;
  try {
    const app = initializeApp(config);
    const auth = getAuth(app);
    const db = initializeFirestore(app, {
      localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
    });
    if (import.meta.env.VITE_FIREBASE_EMULATOR) {
      connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
      connectFirestoreEmulator(db, "127.0.0.1", 8080);
    }
    await signInAnonymously(auth);
    ref = doc(db, "households", householdCode());
  } catch {
    fail();
    return;
  }
  const write = (data) =>
    setDoc(ref, toFields(data), { merge: true }).catch(() =>
      toast("Couldn’t save to the shared plan. Changes are kept on this device."),
    );
  setRemote(write);
  $("shareBtn").hidden = false;
  $("shareBtn").onclick = share;
  onSnapshot(
    ref,
    { includeMetadataChanges: true },
    (snap) => {
      const { hasPendingWrites, fromCache } = snap.metadata;
      // our own writes are already in state; the server echo arrives once they land
      if (hasPendingWrites) {
        status.textContent = "Saving…";
        return;
      }
      status.textContent = fromCache
        ? "Offline copy. Changes sync when you’re back online."
        : "Synced. Anyone with your link sees the same plan.";
      if (!snap.exists()) {
        // only the server can say a household is new; seed it from this device
        if (!fromCache) write(toDoc(state));
        return;
      }
      const data = snap.data();
      replaceState(data);
      render();
      // older documents kept meals as an array; the rules now want the map
      if (Array.isArray(data.meals)) write({ meals: toDoc(state).meals });
    },
    fail,
  );
}
