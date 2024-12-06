import * as path from "node:path";
import { pathToFileURL } from "node:url";

import { createRequestListener } from "@mjackson/node-fetch-server";
import express from "express";

const app = express();
app.disable("x-powered-by");

const entry = pathToFileURL(path.resolve(process.cwd(), process.argv[2])).href;
const mod = await import(entry);

const fetchFunction =
  mod.fetch ??
  mod.handleFetch ??
  mod.default?.fetch ??
  mod.default?.handleFetch ??
  mod.default;

if (typeof fetchFunction !== "function") {
  throw new Error(`No fetch handler function found in '${entry}'.`);
}

app.use(
  express.static("dist/browser/assets", {
    immutable: true,
    maxAge: "1y",
  })
);

app.use(
  express.static("dist/browser", {
    maxAge: "5m",
  })
);

app.use(createRequestListener(fetchFunction));

const port = Number.parseInt(process.env.PORT || "3000", 10);
app.listen(port, () => {
  console.log(`Listening on http://localhost:${port}`);
});
