import { defineConfig } from "vite";

import { framework } from "./framework/vite.js";

export default defineConfig({
  plugins: [
    framework({
      callServer: {
        browser: "./framework/call-server-browser.ts",
        prerender: "./framework/call-server-prerender.ts",
      },
      entries: {
        browser: "src/entry.browser.tsx",
        prerender: "src/entry.prerender.tsx",
        server: "src/entry.server.tsx",
      },
    }),
  ],
});
