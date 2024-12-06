import { parentPort } from "node:worker_threads";

import { ESModulesEvaluator, ModuleRunner } from "vite/module-runner";

const options = JSON.parse(process.env.VITE_DEV_ENVIRONMENT);

const onMessageCallbacks = new Set();

const runner = new ModuleRunner(
  {
    hmr: false,
    root: options.root,
    sourcemapInterceptor: "prepareStackTrace",
    transport: {
      connect(handlers) {
        onMessageCallbacks.add(handlers.onMessage);
      },
      disconnect() {
        onMessageCallbacks.clear();
      },
      send(payload) {
        parentPort.postMessage({
          type: "module-runner",
          payload,
        });
      },
    },
  },
  new ESModulesEvaluator()
);

parentPort.on("message", (message) => {
  switch (message?.type) {
    case "module-runner":
      for (const cb of onMessageCallbacks) {
        cb(message.payload);
      }
      break;
    case "request": {
      handleFetch(message);
      break;
    }
  }
});

async function handleFetch({ id, entry, url, method, headers, hasBody }) {
  try {
    let controller = undefined;

    const body = hasBody
      ? new ReadableStream({
          start(c) {
            controller = c;
          },
        })
      : null;

    // TODO: handle abort signals
    // const abortController = new AbortController();
    const request = new Request(url, {
      body,
      method,
      headers,
      // signal: abortController.signal,
      ...(hasBody ? { duplex: "half" } : undefined),
    });

    if (hasBody) {
      const onMessage = (message) => {
        if (message.type === "request-body" && message.id === id) {
          if (message.done) {
            parentPort.off("message", onMessage);
            controller.close();
          } else {
            controller.enqueue(message.chunk);
          }
        } else if (message.type === "request-error" && message.id === id) {
          parentPort.off("message", onMessage);
          const error = new Error(message.message);
          error.stack = message.stack;
          controller.error(error);
        }
      };
      parentPort.on("message", onMessage);
    }

    const mod = await runner.import(entry);

    const fetchFunction =
      mod.fetch ??
      mod.handleFetch ??
      mod.default?.fetch ??
      mod.default?.handleFetch ??
      mod.default;

    const response = await fetchFunction(request);

    const hasResponseBody = response.body !== null && response.status !== 204;

    parentPort.postMessage({
      type: "response",
      id,
      hasBody: hasResponseBody,
      headers: Array.from(response.headers.entries()),
      status: response.status,
      statusText: response.statusText,
    });

    if (hasResponseBody && response.body) {
      const reader = response.body?.getReader();
      try {
        let read;
        while (!(read = await reader.read()).done) {
          parentPort.postMessage({
            type: "response-body",
            id,
            chunk: read.value,
          });
        }
      } finally {
        reader.releaseLock();
      }
      parentPort.postMessage({
        type: "response-body",
        id,
        done: true,
      });
    }
  } catch (reason) {
    console.error(reason);
    const message = reason instanceof Error ? reason.message : String(reason);
    const stack = reason instanceof Error ? reason.stack : null;

    parentPort.postMessage({
      type: "response-error",
      id,
      message,
      stack,
    });
  }
}

console.debug("created worker", options.name);
