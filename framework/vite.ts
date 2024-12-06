import { createRequestListener } from "@mjackson/node-fetch-server";
import type * as vite from "vite";

import {
  type FetchableDevEnvironment,
  workerDevEnvironmentFactory,
} from "./environment.js";

export type FrameworkEntries = {
  browser: string;
  prerender: string;
  server: string;
};

export type FrameworkOptions = {
  entries: FrameworkEntries;
};

export function framework({ entries }: FrameworkOptions): vite.PluginOption {
  let env: vite.ConfigEnv;
  let devServerURL: URL | undefined;

  return [
    {
      name: "framework:config",
      enforce: "pre",
      config(_, _env) {
        env = _env;

        return {
          environments: {
            browser: {
              consumer: "client",
              build: {
                rollupOptions: {
                  input: entries.browser,
                },
              },
            },
            prerender: {
              consumer: "server",
              build: {
                rollupOptions: {
                  input: entries.prerender,
                },
              },
              dev: {
                createEnvironment: workerDevEnvironmentFactory(),
              },
            },
            server: {
              consumer: "server",
              build: {
                rollupOptions: {
                  input: entries.server,
                },
              },
              dev: {
                createEnvironment: workerDevEnvironmentFactory(),
              },
              resolve: {
                conditions: ["react-server"],
                externalConditions: ["react-server"],
              },
            },
          },
        };
      },
    },
    {
      name: "framework:call-server",
      resolveId(id) {
        if (id === "framework/react-client") {
          return "\0virtual:framework/react-client";
        }
      },
      load(id) {
        if (id === "\0virtual:framework/react-client") {
          if (env.command === "build") {
            throw new Error("not yet implemented");
          }

          if (!devServerURL) {
            throw new Error("expected devServerURL to be set");
          }

          return `
            const devServerURL = ${JSON.stringify(devServerURL.href)};
            export function callServer(request) {
              const hasBody = request.method !== "GET" && request.method !== "HEAD" && !!request.body;

              const headers = new Headers(request.headers);
              headers.set("x-vite-call-server", request.url);

              return fetch(
                new Request(devServerURL, {
                  body: hasBody ? request.body : null,
                  headers,
                  method: request.method,
                  signal: request.signal,
                  ...(hasBody ? { duplex: "half" } : undefined),
                })
              );
            }
          `;
        }
      },
      configureServer(server) {
        const serverEnvironment = server.environments
          .server as FetchableDevEnvironment;

        server.httpServer?.once("listening", () => {
          const address = server.httpServer?.address();
          if (typeof address !== "object" || !address) {
            throw new Error("expected address to be an object");
          }

          let host: string;
          if (address.family === "IPv6") {
            host = `[${address.address}]`;
          } else {
            host = address.address === "::" ? "localhost" : address.address;
          }

          devServerURL = new URL(`http://${host}:${address.port}`);
        });

        server.middlewares.use((req, res, next) => {
          const callServerOriginalURL = Array.isArray(
            req.headers["x-vite-call-server"]
          )
            ? req.headers["x-vite-call-server"][0]
            : req.headers["x-vite-call-server"];
          if (!callServerOriginalURL) {
            return next();
          }

          createRequestListener((request) => {
            const hasBody =
              request.method !== "GET" &&
              request.method !== "HEAD" &&
              !!request.body;

            const headers = new Headers(request.headers);
            headers.delete("x-vite-call-server");

            return serverEnvironment.dispatchFetch(
              entries.server,
              new Request(callServerOriginalURL, {
                body: hasBody ? request.body : null,
                headers,
                method: request.method,
                signal: request.signal,
                ...(hasBody ? { duplex: "half" } : undefined),
              })
            );
          })(req, res);
        });
      },
    },
    {
      name: "framework:dev-server",
      configureServer(server) {
        const prerenderEnvironment = server.environments
          .prerender as FetchableDevEnvironment;

        return () => {
          server.middlewares.use((req, _, next) => {
            req.url = req.originalUrl;
            next();
          });
          server.middlewares.use(
            createRequestListener((request) =>
              prerenderEnvironment.dispatchFetch(entries.prerender, request)
            )
          );
        };
      },
    },
  ];
}
