// Runs against the Firestore emulator: npm run test:rules
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { assertFails, assertSucceeds, initializeTestEnvironment } from "@firebase/rules-unit-testing";
import { collection, deleteDoc, deleteField, doc, getDoc, getDocs, setDoc, updateDoc } from "firebase/firestore";

const ID = "abcdefghij0123456789klmn";
const ok = { meals: { m1: { id: "m1", name: "Tacos", ingredients: [], notes: "" } }, weeks: {}, aisles: {} };
let env;

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: "rules-test",
    firestore: { rules: readFileSync("firestore.rules", "utf8"), host: "127.0.0.1", port: 8080 },
  });
});
afterAll(() => env.cleanup());
beforeEach(() => env.clearFirestore());

const user = (uid = "u1") => env.authenticatedContext(uid).firestore();
const anon = () => env.unauthenticatedContext().firestore();
const hh = (db, id = ID) => doc(db, "households", id);

describe("household rules", () => {
  it("needs a signed-in user", async () => {
    await assertFails(getDoc(hh(anon())));
    await assertFails(setDoc(hh(anon()), ok));
  });

  it("any signed-in user can read and write a household by its code", async () => {
    await assertSucceeds(setDoc(hh(user()), ok));
    await assertSucceeds(getDoc(hh(user("u2"))));
    await assertSucceeds(setDoc(hh(user("u2")), { weeks: { "2026-10-30": { plan: { Fri: "m1" } } } }, { merge: true }));
  });

  it("rejects short or odd codes", async () => {
    await assertFails(getDoc(hh(user(), "short")));
    await assertFails(setDoc(hh(user(), "short"), ok));
    await assertFails(setDoc(hh(user(), "ABCDEFGHIJ0123456789KLMN"), ok));
    await assertFails(setDoc(hh(user(), "a".repeat(41)), ok));
  });

  it("never lists or deletes", async () => {
    await assertSucceeds(setDoc(hh(user()), ok));
    await assertFails(getDocs(collection(user(), "households")));
    await assertFails(deleteDoc(hh(user())));
  });

  it("rejects unknown fields and wrong types, on create and on merge", async () => {
    await assertFails(setDoc(hh(user()), { ...ok, owner: "me" }));
    await assertFails(setDoc(hh(user()), { ...ok, meals: [] }));
    await assertFails(setDoc(hh(user()), { ...ok, weeks: "soon" }));
    await assertSucceeds(setDoc(hh(user()), ok));
    await assertFails(setDoc(hh(user()), { owner: "me" }, { merge: true }));
    await assertFails(updateDoc(hh(user()), { aisles: 1 }));
  });

  it("accepts field-level patches and deletes", async () => {
    await assertSucceeds(setDoc(hh(user()), ok));
    await assertSucceeds(
      setDoc(
        hh(user()),
        { weeks: { "2026-10-30": { checked: { rice: true } } }, meals: { m1: deleteField() } },
        { merge: true },
      ),
    );
    const snap = await getDoc(hh(user()));
    expect(snap.data()).toEqual({ meals: {}, weeks: { "2026-10-30": { checked: { rice: true } } }, aisles: {} });
  });

  it("caps collection sizes", async () => {
    const meals = Object.fromEntries(Array.from({ length: 501 }, (_, i) => ["m" + i, { name: "x" }]));
    await assertFails(setDoc(hh(user()), { ...ok, meals }));
  });
});
