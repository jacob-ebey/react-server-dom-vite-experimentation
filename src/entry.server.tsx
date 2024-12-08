import * as stream from "node:stream";

// @ts-expect-error - no types
import RSD from "@jacob-ebey/react-server-dom-vite/server";

// @ts-expect-error - virtual module with no types
import { manifest } from "framework/react-server";

import { Document } from "./document.js";
import { Counter } from "./counter.js";

export type ServerPayload = {
  returnValue?: unknown;
  root: React.JSX.Element;
};

export function handleFetch(request: Request) {
  const root = (
    <Document>
      <h1>Hello, server!</h1>
      <Counter />
    </Document>
  );

  const payload = { root } satisfies ServerPayload;

  const { abort, pipe } = RSD.renderToPipeableStream(payload, manifest);

  request.signal.addEventListener("abort", () => abort());

  const body = stream.Readable.toWeb(
    pipe(new stream.PassThrough())
  ) as ReadableStream<Uint8Array>;

  return new Response(body);
}
