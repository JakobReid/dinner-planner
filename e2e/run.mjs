import { build, serve, launch } from "./lib.mjs";
import * as picker from "./picker.spec.mjs";
import * as shop from "./shop.spec.mjs";
import * as weeks from "./weeks.spec.mjs";
import * as dialogs from "./dialogs.spec.mjs";
import * as mobile from "./mobile.spec.mjs";
import * as sync from "./sync.spec.mjs";

// `node e2e/run.mjs sync` runs the sync spec against the Firebase emulators (npm run e2e:sync)
const emulator = process.argv.includes("sync");
build({ emulator });
const server = serve();
const browser = await launch();
let failed = 0;
for (const spec of emulator ? [sync] : [picker, shop, weeks, dialogs, mobile]) {
  for (const [name, fn] of Object.entries({ ...spec.tests, ...spec.mealsTests })) {
    try {
      await fn(browser, server.url);
      console.log("  ok   " + name);
    } catch (e) {
      failed++;
      console.log(
        "  FAIL " +
          name +
          "\n       " +
          String(e.message || e)
            .split("\n")
            .join("\n       "),
      );
    }
  }
}
await browser.close();
server.close();
console.log(failed ? `\n${failed} failing` : "\nall passing");
process.exit(failed ? 1 : 0);
