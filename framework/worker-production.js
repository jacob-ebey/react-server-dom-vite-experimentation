import { parentPort } from "node:worker_threads";

import { handleFetch } from "./worker-shared.js";

const options = JSON.parse(process.env.WORKER_ENVIRONMENT);

console.log({ options });
const mod = await import(options.entry);
const fetchFunction =
  mod.fetch ??
  mod.handleFetch ??
  mod.default?.fetch ??
  mod.default?.handleFetch ??
  mod.default;

if (typeof fetchFunction !== "function") {
  throw new Error(`No fetch handler function found in '${entry}'.`);
}

parentPort.on("message", (message) => {
  switch (message?.type) {
    case "request": {
      handleFetch(message, fetchFunction);
      break;
    }
  }
});
