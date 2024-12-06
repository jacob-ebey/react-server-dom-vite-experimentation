import * as wt from "node:worker_threads";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

import * as vite from "vite";

export interface FetchableDevEnvironment extends vite.DevEnvironment {
  dispatchFetch(entry: string, request: Request): Promise<Response>;
}

export type WorkerDevEnvironmentFactoryOptions = {
  workerScript?: string;
};

export function workerDevEnvironmentFactory({
  workerScript,
}: WorkerDevEnvironmentFactoryOptions = {}) {
  workerScript =
    workerScript ||
    path.join(path.dirname(fileURLToPath(import.meta.url)), "worker-script.js");

  return (
    name: string,
    config: vite.ResolvedConfig
  ): FetchableDevEnvironment => {
    console.debug("creating environment", name);
    const allConditions = [
      ...new Set([
        ...config.environments[name].resolve.conditions,
        ...config.resolve.conditions,
        ...config.environments[name].resolve.externalConditions,
        ...config.resolve.externalConditions,
      ]),
    ].flatMap((condition) => ["--conditions", condition]);

    console.log({ allConditions });
    const worker = new wt.Worker("./worker-script.js", {
      env: {
        ...process.env,
        VITE_DEV_ENVIRONMENT: JSON.stringify({
          name: name,
          root: config.root,
        }),
      },
      execArgv: [...allConditions],
      name: `vite-environment-${name}`,
      stderr: true,
      stdout: true,
    });
    worker.stderr.pipe(process.stderr);
    worker.stdout.pipe(process.stdout);

    return new WorkerDevEnvironment(
      name,
      config,
      {
        hot: false,
        transport: new WorkerHotChannel(worker),
      },
      worker
    );
  };
}

class WorkerDevEnvironment
  extends vite.DevEnvironment
  implements FetchableDevEnvironment
{
  private fetchCounter = 0;

  constructor(
    name: string,
    config: vite.ResolvedConfig,
    context: vite.DevEnvironmentContext,
    private worker: wt.Worker
  ) {
    super(name, config, context);
  }

  async close() {
    await this.worker.terminate();
  }

  async dispatchFetch(entry: string, request: Request): Promise<Response> {
    const id = this.fetchCounter++;

    const hasRequestBody =
      request.method !== "GET" && request.method !== "HEAD" && !!request.body;

    this.worker.postMessage({
      type: "request",
      id,
      entry,
      url: request.url,
      method: request.method,
      headers: Array.from(request.headers.entries()),
      hasBody: hasRequestBody,
    });

    const requestBody = request.body;
    if (hasRequestBody && requestBody) {
      (async () => {
        const reader = requestBody.getReader();
        try {
          let read: { done: boolean; value?: Uint8Array };
          while (!(read = await reader.read()).done) {
            this.worker.postMessage({
              type: "request-body",
              id,
              chunk: read.value,
            });
          }
          this.worker.postMessage({
            type: "request-body",
            id,
            done: true,
          });
        } catch (reason) {
          console.error(reason);
          const message =
            reason instanceof Error ? reason.message : String(reason);
          const stack = reason instanceof Error ? reason.stack : null;

          this.worker.postMessage({
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

    let controller: ReadableStreamDefaultController<Uint8Array>;
    const deferredResponse = new Deferred<Response>();
    const listenForResponse = (value) => {
      if (value?.type === "response" && value.id === id) {
        const body = value.hasBody
          ? new ReadableStream<Uint8Array>({
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
          this.worker.off("message", listenForResponse);
        }
      } else if (value?.type === "response-body" && value.id === id) {
        if (value.done) {
          this.worker.off("message", listenForResponse);
          controller.close();
        } else {
          controller.enqueue(value.chunk);
        }
      } else if (value?.type === "response-error" && value.id === id) {
        this.worker.off("message", listenForResponse);
        const err = new Error(value.message);
        err.stack = value.stack;
        deferredResponse.reject(err);
        if (controller) {
          controller.error(err);
        }
      }
    };
    this.worker.on("message", listenForResponse);

    return deferredResponse.promise;
  }
}

class WorkerHotChannel implements vite.HotChannel {
  private callbacks = new Map();

  constructor(private worker: wt.Worker) {
    this.onMessage = this.onMessage.bind(this);
  }

  onMessage(message) {
    if (message.type === "module-runner") {
      const events = this.callbacks.get(message.payload.event);
      if (events) {
        for (const event of events) {
          event(message.payload.data, {
            send: (payload) => {
              this.worker.postMessage({
                type: "module-runner",
                payload,
              });
            },
          });
        }
      }
    }
  }

  listen(): void {
    this.worker.on("message", this.onMessage);
  }

  close() {
    this.worker.off("message", this.onMessage);
  }

  on(event, listener) {
    const events = this.callbacks.get(event) ?? new Set();
    events.add(listener);
    this.callbacks.set(event, events);
  }

  off(event, listener) {
    const events = this.callbacks.get(event);
    if (events) {
      events.delete(listener);
    }
  }

  send(payload: vite.HotPayload) {
    this.worker.postMessage({
      type: "module-runner",
      payload,
    });
  }
}

class Deferred<T> {
  resolve: (value: T) => void;
  reject: (reason: unknown) => void;
  promise: Promise<T>;

  constructor() {
    this.promise = new Promise<T>((resolve, reject) => {
      this.resolve = resolve;
      this.reject = reject;
    });
  }
}
