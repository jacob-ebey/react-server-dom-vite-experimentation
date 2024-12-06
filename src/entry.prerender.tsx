import * as stream from "node:stream";

// @ts-expect-error - no types
import { createFromNodeStream } from "@jacob-ebey/react-server-dom-vite/client";
import { renderToPipeableStream } from "react-dom/server";

// @ts-expect-error - virtual module with no types
import { callServer } from "framework/react-client";

const manifest = {
  resolveClientReference() {
    throw new Error("client references are not yet implemented");
  },
  resolveServerReference() {
    throw new Error("server references are not yet implemented");
  },
};

export async function handleFetch(request: Request) {
  const serverResponse = await callServer(request);

  const node = await createFromNodeStream(
    stream.Readable.fromWeb(serverResponse.body),
    manifest
  );

  const { abort, pipe } = renderToPipeableStream(
    <html lang="en">
      <head>
        <title>Title</title>
      </head>
      <body>
        {node}
        <p>Hello, Client!</p>
      </body>
    </html>
  );

  request.signal.addEventListener("abort", () => abort());

  const body = stream.Readable.toWeb(
    pipe(new stream.PassThrough())
  ) as ReadableStream<Uint8Array>;

  return new Response(body, {
    status: serverResponse.status,
    statusText: serverResponse.statusText,
    headers: serverResponse.headers,
  });
}
