import * as stream from "node:stream";

// @ts-expect-error - no types
import RSD from "@jacob-ebey/react-server-dom-vite/client";
import { renderToPipeableStream } from "react-dom/server";
import { injectRSCPayload } from "rsc-html-stream/server";

// @ts-expect-error - virtual module with no types
import { bootstrapModules, callServer, manifest } from "framework/react-client";

import type { ServerPayload } from "./entry.server.js";

export async function handleFetch(request: Request) {
  const serverResponse: Response = await callServer(request);

  if (request.headers.get("Accept")?.match(/\btext\/x-component\b/)) {
    return serverResponse;
  }

  if (!serverResponse.body) {
    throw new Error("Expected response body");
  }

  const [rscA, rscB] = serverResponse.body.tee();

  const payload: ServerPayload = await RSD.createFromNodeStream(
    stream.Readable.fromWeb(rscA as any),
    manifest
  );

  const { abort, pipe } = renderToPipeableStream(payload.root, {
    bootstrapModules,
    // @ts-expect-error - no types yet
    formState: payload.formState,
  });

  request.signal.addEventListener("abort", () => abort());

  const body = stream.Readable.toWeb(
    pipe(new stream.PassThrough())
  ) as ReadableStream<Uint8Array>;

  return new Response(body.pipeThrough(injectRSCPayload(rscB)), {
    status: serverResponse.status,
    statusText: serverResponse.statusText,
    headers: serverResponse.headers,
  });
}
