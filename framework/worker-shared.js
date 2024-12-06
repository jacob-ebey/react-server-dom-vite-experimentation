import { parentPort } from "node:worker_threads";

export async function handleFetch({ id, url, method, headers, hasBody }, cb) {
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

    const response = await cb(request);

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

const fetchCounters = new WeakMap();
export function fetchWorker(worker, request, extra) {
  let fetchCounter = fetchCounters.get(worker) ?? 0;
  const id = fetchCounter++;
  fetchCounters.set(worker, fetchCounter);

  const hasRequestBody =
    request.method !== "GET" && request.method !== "HEAD" && !!request.body;

  worker.postMessage({
    type: "request",
    id,
    url: request.url,
    method: request.method,
    headers: Array.from(request.headers.entries()),
    hasBody: hasRequestBody,
    ...extra,
  });

  const requestBody = request.body;
  if (hasRequestBody && requestBody) {
    (async () => {
      const reader = requestBody.getReader();
      try {
        let read;
        while (!(read = await reader.read()).done) {
          worker.postMessage({
            type: "request-body",
            id,
            chunk: read.value,
          });
        }
        worker.postMessage({
          type: "request-body",
          id,
          done: true,
        });
      } catch (reason) {
        console.error(reason);
        const message =
          reason instanceof Error ? reason.message : String(reason);
        const stack = reason instanceof Error ? reason.stack : null;

        worker.postMessage({
          type: "request-error",
          id,
          message,
          stack,
        });
      } finally {
        reader.releaseLock();
      }
    })();
  }

  let controller;
  const deferredResponse = new Deferred();
  const listenForResponse = (value) => {
    if (value?.type === "response" && value.id === id) {
      const body = value.hasBody
        ? new ReadableStream({
            start(c) {
              controller = c;
            },
          })
        : null;
      deferredResponse.resolve(
        new Response(body, {
          headers: value.headers,
          status: value.status,
          statusText: value.statusText,
        })
      );
      if (!value.hasBody) {
        worker.off("message", listenForResponse);
      }
    } else if (value?.type === "response-body" && value.id === id) {
      if (value.done) {
        worker.off("message", listenForResponse);
        controller.close();
      } else {
        controller.enqueue(value.chunk);
      }
    } else if (value?.type === "response-error" && value.id === id) {
      worker.off("message", listenForResponse);
      const err = new Error(value.message);
      err.stack = value.stack;
      deferredResponse.reject(err);
      if (controller) {
        controller.error(err);
      }
    }
  };
  worker.on("message", listenForResponse);

  return deferredResponse.promise;
}

class Deferred {
  constructor() {
    this.promise = new Promise((resolve, reject) => {
      this.resolve = resolve;
      this.reject = reject;
    });
  }
}
