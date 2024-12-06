import { defineConfig } from "vite";

import { framework } from "./framework/vite.js";

export default defineConfig({
  plugins: [
    framework({
      entries: {
        browser: "src/entry.browser.tsx",
        prerender: "src/entry.prerender.tsx",
        server: "src/entry.server.tsx",
      },
    }),
  ],
});
