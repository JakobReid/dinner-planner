# Dinner planner

Plan the week's dinners, keep a list of meals, and get a shopping list sorted by aisle. Shared with
whoever has your household link. Vanilla JS on Vite, Firestore for sync, Firebase Hosting.

## Run it

```
npm install
cp .env.example .env.local   # fill in the Firebase web config, or leave blank for device-only
npm run dev
```

`npm run build` writes `dist/`, `npm run deploy` builds and pushes it and the Firestore rules to Firebase.

Checks, or all of them with `npm run check`:

- `npm run lint` and `npm run format`
- `npm test` Vitest over the pure parts: dates, aisle guessing, state repair and every operation's patch
- `npm run test:rules` the security rules against the Firestore emulator (needs Java)
- `npm run e2e` Playwright in headless Chromium against a device-only build

## How sync works

One Firestore document per household at `households/{code}`; the 24-character code in the share link
is the only key. Anonymous auth signs every device in. Each state operation describes its change as a
nested patch which sync merges into the document field by field, so two phones editing different
things never overwrite each other. The offline cache queues writes without signal and replays them
when back online. In the document, meals are a map keyed by id so a meal edit is one field write.

## Layout

- `src/main.js` boots the views and sync
- `src/state.js` the household object, repairs and migrations, and every operation that changes it
- `src/sync.js` Firestore: household code, share link, snapshot in / write out
- `src/dates.js` calendar helpers; the week runs Friday to Thursday
- `src/aisles.js` aisle list and the keyword table that files ingredients into them
- `src/dialogs.js` scroll lock and keyboard handling for the two dialogs
- `src/dom.js` element helpers, icons, toast
- `src/views/` one module per screen: week, meals, shop, picker, editor, tabs
- `test/` Vitest unit tests; `test/rules/` needs the emulator
- `e2e/` Playwright checks against a built copy
- `firestore.rules` security rules: signed-in only, valid codes only, known top-level fields, no list or delete
