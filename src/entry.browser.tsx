import {
  createFromFetch,
  createFromReadableStream,
  encodeReply,
  // @ts-expect-error - no types
} from "@jacob-ebey/react-server-dom-vite/client";
import { startTransition, useState } from "react";
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

async function callServer(id: string, args: unknown) {
  const fetchPromise = fetch(
    new Request(window.location.href, {
      method: "POST",
      headers: {
        Accept: "text/x-component",
        "rsc-action": id,
      },
      body: await encodeReply(args),
    })
  );

  const payload: ServerPayload = await createFromFetch(fetchPromise, manifest, {
    callServer,
  });

  startTransition(() => {
    updateRoot(payload.root);
  });

  return payload.returnValue;
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
