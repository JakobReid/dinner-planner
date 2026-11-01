import js from "@eslint/js";
import globals from "globals";

export default [
  { ignores: ["dist/", "dist-test/", "node_modules/"] },
  js.configs.recommended,
  { files: ["src/**/*.js"], languageOptions: { ecmaVersion: 2022, sourceType: "module", globals: globals.browser } },
  { files: ["e2e/**/*.mjs", "*.config.js"], languageOptions: { ecmaVersion: 2022, sourceType: "module", globals: { ...globals.node, ...globals.browser } } },
];
