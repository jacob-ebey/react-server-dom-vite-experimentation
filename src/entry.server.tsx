import * as stream from "node:stream";

// @ts-expect-error - no types
import RSD from "@jacob-ebey/react-server-dom-vite/server";

// @ts-expect-error - virtual module with no types
import { manifest } from "framework/react-server";

import { logMessage } from "./actions.js";
import { Counter } from "./counter.js";
import { Document } from "./document.js";

export type ServerPayload = {
  formState?: unknown;
  returnValue?: unknown;
  root: React.JSX.Element;
};

export async function handleFetch(request: Request) {
  let formState: unknown;
  let returnValue: unknown;

  const actionId = request.headers.get("rsc-action");
  try {
    if (actionId) {
      const reference = manifest.resolveServerReference(actionId);
      await reference.preload();
      const action = reference.get() as ((...args: unknown[]) => unknown) & {
        $$typeof: symbol;
      };
      if (action.$$typeof !== Symbol.for("react.server.reference")) {
        throw new Error("Invalid action");
      }

      const args = await RSD.decodeReply(await request.formData(), manifest);
      returnValue = action.apply(null, args);
      try {
        await returnValue;
      } catch {}
    } else if (request.method === "POST") {
      const formData = await request.formData();
      const action = await RSD.decodeAction(formData, manifest);
      formState = await RSD.decodeFormState(await action(), formData, manifest);
    }
  } catch (error) {
    // TODO: Set server state
  }

  const root = (
    <Document>
      <h1>Hello, server!</h1>
      <Counter />
      <form action={logMessage}>
        <input type="text" name="message" />
        <button type="submit">Log Message</button>
      </form>
    </Document>
  );

  const payload = {
    formState,
    returnValue,
    root,
  } satisfies ServerPayload;

  const { abort, pipe } = RSD.renderToPipeableStream(payload, manifest);

  request.signal.addEventListener("abort", () => abort());

  const body = stream.Readable.toWeb(
    pipe(new stream.PassThrough())
  ) as ReadableStream<Uint8Array>;

  return new Response(body);
}
