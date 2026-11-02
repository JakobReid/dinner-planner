import { defineConfig } from "vite";

// RULES=1 runs the Firestore rules suite instead; it needs the emulator (npm run test:rules).
export default defineConfig({
  build: { target: "es2022", sourcemap: true },
  test: { include: process.env.RULES ? ["test/rules/*.test.js"] : ["test/*.test.js"] },
});
