# Dinner planner

Plan the week's dinners (and breakfasts, lunches or any other meal time), keep a list of meals, and get
a shopping list sorted by aisle. Shared with
whoever has your household link. Vanilla JS on Vite, Firestore for sync, Firebase Hosting.

## Run it

```
npm install
cp .env.example .env.local   # fill in the Firebase web config, or leave blank for device-only
npm run dev
```

`npm run build` writes `dist/`, `npm run deploy` builds and pushes it and the Firestore rules to Firebase.
GitHub Actions does the same on every push to main once the checks pass (`.github/workflows/deploy.yml`);
it needs the four `VITE_FIREBASE_*` values and a `FIREBASE_SERVICE_ACCOUNT` key JSON as repo secrets.

Checks, or all of them with `npm run check`:

- `npm run lint` and `npm run format`
- `npm test` Vitest over the pure parts: dates, aisle guessing, state repair and every operation's patch
- `npm run test:rules` the security rules against the Firestore emulator (needs Java)
- `npm run e2e` Playwright in headless Chromium against a device-only build

## Layout

Four tabs in a bar fixed to the foot of the screen (Week, Meals, Shopping, Settings). Settings holds
sign in or out, this list and its people, the meal times, and the theme. The header is just the week
being viewed. Every dialog is a
bottom sheet (`src/dialogs.js`) with its actions pinned in a footer, Close or Cancel on the left and
the main action on the right; drag the head down or tap outside to dismiss. Destructive actions sit
apart from those and either ask first (`confirmSheet`) or offer Undo in the toast. Toasts sit just
above the tab bar, or above the sheet while one is open.

## Meal times

A list has an ordered set of meal times, by default Breakfast, Lunch and Dinner. Each is either shared
(one plan a day for the whole list, as Dinner always was) or each person (every member plans their own;
you can read the others' but only change yours, which the app enforces and the rules do not). Week shows
one as a row of tabs and opens on Dinner. Any meal can go in any meal time, and every meal time and
person feeds the shopping list.

In the document, `mealTimes` is a map by id and is only written once a list changes its meal times;
without it the three defaults apply. A week's shared dinners stay in its `plan` field, where they have
always been, so nothing is migrated and an older build still reads and writes them. Every other plan is
in `plans[mealTimeId][who][day]`, where `who` is a member's id, or `all` for a shared meal time. `people`
holds the name each member goes by, written by that member; a guest's device plans as `me` until they
sign in.

## How sync works

One Firestore document per household at `households/{code}`, with a `members` map of the people in it,
and a `users/{uid}` document naming the households you're in and the one you had open last. Guests
keep everything on their device and nothing is written; "Sign in with Google" or an email link turns
on sync and sharing, a first sign-in seeds your Home list from the device, and from then on your lists
follow you between devices. Anonymous auth tokens are refused by the rules.

Sharing is by email. A member adds an address to the household's `invites` map; when that person
signs in with a verified matching email the list is found by a query on `invites.<email>` and they
add themselves to `members`. A list code in the URL on its own gets you nothing unless you're invited.
Nobody can list households otherwise. Everyone in a list is equal: anyone can invite, withdraw an
invite, rename, or leave, and the last person out deletes it. There are no owners or admins.

Each state operation describes its change as a nested patch which sync merges into the document field
by field, so two phones editing different things never overwrite each other. The offline cache queues
writes without signal and replays them when back online. Meals are stored as a map keyed by id so a
meal edit is one field write. Households from before membership are claimed by the first account that
opens them.

Google and email-link sign-in must be enabled under Authentication > Sign-in method in the Firebase
console; nothing in the code turns them on.
