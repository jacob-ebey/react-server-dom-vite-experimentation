import * as stream from "node:stream";

// @ts-expect-error - no types
import { renderToPipeableStream } from "@jacob-ebey/react-server-dom-vite/server";

const manifest = {
  resolveClientReferenceMetadata() {
    throw new Error("client references are not yet implemented");
  },
};

export function handleFetch(request: Request) {
  const { abort, pipe } = renderToPipeableStream(
    <h1>Hello, Server!</h1>,
    manifest
  );

  request.signal.addEventListener("abort", () => abort());

  const body = stream.Readable.toWeb(
    pipe(new stream.PassThrough())
  ) as ReadableStream<Uint8Array>;

  return new Response(body);
}
