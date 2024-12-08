// @ts-expect-error - no types
import { createFromReadableStream } from "@jacob-ebey/react-server-dom-vite/client";
import { useState } from "react";
import { hydrateRoot } from "react-dom/client";
import { rscStream } from "rsc-html-stream/client";

// @ts-expect-error - virtual module with no types
import { manifest } from "framework/react-client";

import type { ServerPayload } from "./entry.server.js";
import { api, callServer } from "./browser-references.js";

hydrateApp();

function Shell(props: { root: React.JSX.Element }) {
  const [root, setRoot] = useState(props.root);
  api.updateRoot = setRoot;
  return root;
}

async function hydrateApp() {
  const payload: ServerPayload = await createFromReadableStream(
    rscStream,
    manifest,
    {
      callServer,
    }
  );

  hydrateRoot(document, <Shell root={payload.root} />);
}
