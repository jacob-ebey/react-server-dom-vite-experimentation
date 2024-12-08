// @ts-expect-error - no types
import { createFromReadableStream } from "@jacob-ebey/react-server-dom-vite/client";
import { useState } from "react";
import { hydrateRoot } from "react-dom/client";
import { rscStream } from "rsc-html-stream/client";

// @ts-expect-error - virtual module with no types
import { manifest } from "framework/react-client";

import type { ServerPayload } from "./entry.server.js";

hydrateApp();

let updateRoot: (root: React.JSX.Element) => void;
function Shell(props: { root: React.JSX.Element }) {
  const [root, setRoot] = useState(props.root);
  updateRoot = setRoot;
  return root;
}

async function hydrateApp() {
  const payload: ServerPayload = await createFromReadableStream(
    rscStream,
    manifest
  );

  hydrateRoot(document, <Shell root={payload.root} />);
}
