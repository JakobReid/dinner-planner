// Shared harness: build a device-only copy (Firebase env blanked), serve it, hand each spec a fresh page.
import { chromium } from "playwright";
import { execSync } from "node:child_process";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";

export { assert };
const ROOT = new URL("..", import.meta.url).pathname;
export const OUT = path.join(ROOT, "dist-test");
const TYPES = { ".html": "text/html", ".css": "text/css", ".js": "text/javascript", ".map": "application/json" };

// `emulator` points the build at the local Firebase emulators instead of blanking sync.
export function build({ emulator = false } = {}) {
  const env = {
    ...process.env,
    VITE_FIREBASE_API_KEY: emulator ? "fake" : "",
    VITE_FIREBASE_AUTH_DOMAIN: "",
    VITE_FIREBASE_PROJECT_ID: emulator ? "demo-dinner" : "",
    VITE_FIREBASE_APP_ID: emulator ? "1:1:web:1" : "",
    VITE_FIREBASE_EMULATOR: emulator ? "1" : "",
  };
  execSync(`npx vite build --outDir ${OUT} --logLevel error`, { cwd: ROOT, env, stdio: "inherit" });
}

export function serve() {
  const srv = http
    .createServer((req, res) => {
      const u = req.url.split("?")[0];
      const p = path.join(OUT, u === "/" ? "index.html" : u);
      if (!fs.existsSync(p)) {
        res.writeHead(404);
        res.end();
        return;
      }
      res.writeHead(200, { "content-type": TYPES[path.extname(p)] || "application/octet-stream" });
      res.end(fs.readFileSync(p));
    })
    .listen(0);
  return { url: `http://localhost:${srv.address().port}/`, close: () => srv.close() };
}

export async function launch() {
  return chromium.launch();
}

// Opens a page with console/page errors collected; `seed` is written to localStorage before load.
export async function open(browser, url, { viewport = { width: 420, height: 860 }, seed = null, touch = true } = {}) {
  const ctx = await browser.newContext({ viewport, hasTouch: touch });
  const pg = await ctx.newPage();
  const errors = [];
  pg.on("pageerror", (e) => errors.push("pageerror: " + e.message));
  pg.on("console", (m) => {
    if (m.type() === "error") errors.push("console: " + m.text());
  });
  if (seed) await pg.addInitScript((s) => localStorage.setItem("dinner-planner-v1", JSON.stringify(s)), seed);
  await pg.goto(url);
  await pg.waitForSelector("#days .day", { state: "attached" });
  return { pg, ctx, errors };
}

export const box = async (loc) => {
  const r = await loc.boundingBox();
  return {
    top: Math.round(r.y),
    bottom: Math.round(r.y + r.height),
    left: Math.round(r.x),
    right: Math.round(r.x + r.width),
  };
};
export const pause = (ms) => new Promise((r) => setTimeout(r, ms));
