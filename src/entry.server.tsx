import * as stream from "node:stream";

// @ts-expect-error - no types
import { renderToPipeableStream } from "@jacob-ebey/react-server-dom-vite/server";

import { Counter } from "./counter.js";

const manifest = {
  resolveClientReferenceMetadata(clientReference: { $$id: string }) {
    if (import.meta.env.DEV) {
      const split = clientReference.$$id.split("#");
      return [split[0], split.slice(1).join("#")];
    }

    throw new Error("client references are not yet implemented for production");
  },
};

export function handleFetch(request: Request) {
  const { abort, pipe } = renderToPipeableStream(
    <>
      <h1>Hello, server!</h1>
      <Counter />
    </>,
    manifest
  );

  request.signal.addEventListener("abort", () => abort());

  const body = stream.Readable.toWeb(
    pipe(new stream.PassThrough())
  ) as ReadableStream<Uint8Array>;

  return new Response(body);
}
