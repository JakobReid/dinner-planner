# Dinner planner

Plan the week's dinners, keep a list of meals, and get a shopping list sorted by aisle. Shared with
whoever has your household link. Vanilla JS on Vite, Firestore for sync, Firebase Hosting.

## Run it

```
npm install
cp .env.example .env.local   # fill in the Firebase web config, or leave blank for device-only
npm run dev
```

`npm run build` writes `dist/`, `npm run deploy` builds and pushes it to Firebase Hosting.
`npm run lint`, `npm run format` and `npm run e2e` (headless Chromium, device-only build) keep it honest.

## Layout

- `src/main.js` boots the views and sync
- `src/state.js` the household object, repairs and migrations, and every operation that changes it
- `src/sync.js` Firestore: household code, share link, snapshot in / write out
- `src/dates.js` calendar helpers; the week runs Friday to Thursday
- `src/aisles.js` aisle list and the keyword table that files ingredients into them
- `src/dialogs.js` scroll lock and keyboard handling for the two dialogs
- `src/dom.js` element helpers, icons, toast
- `src/views/` one module per screen: week, meals, shop, picker, editor, tabs
- `e2e/` Playwright checks against a built copy
- `firestore.rules` security rules, deployed with `firebase deploy --only firestore`
