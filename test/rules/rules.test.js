// Runs against the Firestore emulator: npm run test:rules
import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";
import { readFileSync } from "node:fs";
import { assertFails, assertSucceeds, initializeTestEnvironment } from "@firebase/rules-unit-testing";
import { collection, deleteDoc, deleteField, doc, getDoc, getDocs, setDoc, updateDoc } from "firebase/firestore";

const ID = "abcdefghij0123456789klmn";
const meals = { m1: { id: "m1", name: "Tacos", ingredients: [], notes: "" } };
const fresh = (uid) => ({ name: "Home", members: { [uid]: true }, meals, weeks: {}, aisles: {} });
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
// seed straight past the rules
const seed = (id, data) => env.withSecurityRulesDisabled((c) => setDoc(doc(c.firestore(), "households", id), data));

describe("household membership", () => {
  it("needs a signed-in user", async () => {
    await assertFails(getDoc(hh(anon())));
    await assertFails(setDoc(hh(anon()), fresh("u1")));
  });

  it("you can create a household with just yourself in it", async () => {
    await assertSucceeds(setDoc(hh(user()), fresh("u1")));
    await assertFails(setDoc(hh(user(), "b".repeat(24)), { ...fresh("u1"), members: { u1: true, u2: true } }));
    await assertFails(setDoc(hh(user(), "c".repeat(24)), { ...fresh("u1"), members: {} }));
    await assertFails(setDoc(hh(user(), "d".repeat(24)), { name: "Home", meals, weeks: {}, aisles: {} }));
  });

  it("members read and edit; outsiders can't read", async () => {
    await seed(ID, fresh("u1"));
    await assertSucceeds(getDoc(hh(user("u1"))));
    await assertFails(getDoc(hh(user("u2"))));
    await assertSucceeds(setDoc(hh(user("u1")), { weeks: { "2026-10-30": { plan: { Fri: "m1" } } } }, { merge: true }));
    await assertFails(setDoc(hh(user("u2")), { weeks: { "2026-10-30": { plan: { Fri: "m1" } } } }, { merge: true }));
  });

  it("joining by link adds only yourself and touches nothing else", async () => {
    await seed(ID, fresh("u1"));
    await assertSucceeds(setDoc(hh(user("u2")), { members: { u2: true } }, { merge: true }));
    await assertSucceeds(getDoc(hh(user("u2"))));
    await assertFails(setDoc(hh(user("u3")), { members: { u3: true }, name: "Mine now" }, { merge: true }));
    await assertFails(setDoc(hh(user("u3")), { members: { u3: true, u4: true } }, { merge: true }));
  });

  it("nobody can add or remove anyone else", async () => {
    await seed(ID, { ...fresh("u1"), members: { u1: true, u2: true } });
    await assertFails(updateDoc(hh(user("u1")), { "members.u2": deleteField() }));
    await assertFails(updateDoc(hh(user("u1")), { "members.u3": true }));
    await assertSucceeds(updateDoc(hh(user("u1")), { "members.u1": deleteField() }));
  });

  it("only the last member can delete, and nobody can list", async () => {
    await seed(ID, { ...fresh("u1"), members: { u1: true, u2: true } });
    await assertFails(deleteDoc(hh(user("u1"))));
    await updateDoc(hh(user("u2")), { "members.u2": deleteField() });
    await assertSucceeds(deleteDoc(hh(user("u1"))));
    await assertFails(getDocs(collection(user(), "households")));
  });

  it("a household from before membership can be read and claimed by anyone with its code", async () => {
    await seed(ID, { meals: [meals.m1], weeks: {}, aisles: {} }); // old shape: meals as an array
    await assertSucceeds(getDoc(hh(user("u9"))));
    await assertFails(setDoc(hh(user("u9")), { name: "x" }, { merge: true }), "content edit before claiming");
    await assertSucceeds(setDoc(hh(user("u9")), { members: { u9: true } }, { merge: true }));
    await assertFails(getDoc(hh(user("u8"))), "claimed, so it's members only now");
    await assertFails(setDoc(hh(user("u9")), { name: "Home" }, { merge: true }), "still the old shape");
    await assertSucceeds(setDoc(hh(user("u9")), { meals }, { merge: true }), "repairing it is allowed");
    await assertSucceeds(setDoc(hh(user("u9")), { name: "Home" }, { merge: true }));
  });

  it("rejects unknown fields, wrong types and oversized maps", async () => {
    await assertFails(setDoc(hh(user()), { ...fresh("u1"), owner: "me" }));
    await assertFails(setDoc(hh(user()), { ...fresh("u1"), meals: [] }));
    await assertFails(setDoc(hh(user()), { ...fresh("u1"), name: 7 }));
    const many = Object.fromEntries(Array.from({ length: 501 }, (_, i) => ["m" + i, { name: "x" }]));
    await assertFails(setDoc(hh(user()), { ...fresh("u1"), meals: many }));
    await assertFails(setDoc(hh(user(), "short"), fresh("u1")));
  });
});

describe("user docs", () => {
  const u = (db, id) => doc(db, "users", id);
  it("are private and shaped", async () => {
    await assertSucceeds(setDoc(u(user("u1"), "u1"), { households: { [ID]: true }, current: ID }));
    await assertSucceeds(getDoc(u(user("u1"), "u1")));
    await assertFails(getDoc(u(user("u2"), "u1")));
    await assertFails(setDoc(u(user("u2"), "u1"), { current: ID }));
    await assertFails(setDoc(u(user("u1"), "u1"), { email: "x" }));
    await assertFails(setDoc(u(user("u1"), "u1"), { current: 5 }));
    await assertSucceeds(deleteDoc(u(user("u1"), "u1")));
  });
});
