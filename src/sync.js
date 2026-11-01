// Household sync over Firestore. One document per household; the code in the link is the key.
// Without Firebase config the app runs on this device only.
import { initializeApp } from "firebase/app";
import { getAuth, signInAnonymously } from "firebase/auth";
import { getFirestore, doc, setDoc, onSnapshot } from "firebase/firestore";
import { $, toast } from "./dom.js";
import { replaceState, setRemote, isSaving, flush, save } from "./state.js";
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
    await signInAnonymously(getAuth(app));
    ref = doc(getFirestore(app), "households", householdCode());
  } catch {
    fail();
    return;
  }
  setRemote(
    (data) => setDoc(ref, data),
    () => toast("Couldn’t save to the shared plan. Changes are kept on this device."),
  );
  $("shareBtn").hidden = false;
  $("shareBtn").onclick = share;
  onSnapshot(
    ref,
    (snap) => {
      status.textContent = "Synced. Anyone with your link sees the same plan.";
      if (isSaving()) return;
      if (!snap.exists()) {
        save();
        flush();
        return;
      }
      replaceState(snap.data());
      render();
    },
    fail,
  );
}
