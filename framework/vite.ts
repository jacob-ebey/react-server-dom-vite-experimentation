import * as crypto from "node:crypto";

import { createRequestListener } from "@mjackson/node-fetch-server";
import { clientTransform, serverTransform } from "unplugin-rsc";
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
  const clientModules = new Map<string, string>();

  function generateId(
    filename: string,
    directive: "use client" | "use server"
  ) {
    if (directive === "use server") {
      throw new Error("server actions are not yet implemented");
    }

    if (env.command === "build") {
      const hash = crypto
        .createHash("sha256")
        .update(filename)
        .digest("hex")
        .slice(0, 8);
      clientModules.set(filename, hash);
      return hash;
    }

    return filename;
  }

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
      name: "framework:virtual-react-client",
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

            export const manifest = {
              resolveClientReference([id, name]) {
                let modPromise;
                return {
                  preload: async () => {
                    if (modPromise) {
                      return modPromise;
                    }

                    modPromise = import(/* @vite-ignore */ id);
                    return modPromise
                      .then((mod) => {
                        modPromise.mod = mod;
                      })
                      .catch((error) => {
                        modPromise.error = error;
                      });
                  },
                  get: () => {
                    if (!modPromise) {
                      throw new Error(\`Module "\${id}" not preloaded\`);
                    }
                    if ("error" in modPromise) {
                      throw modPromise.error;
                    }
                    return modPromise.mod[name];
                  },
                };
              },
            };
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
      name: "framework:react-transform",
      transform(code, id) {
        if (this.environment.name === "server") {
          return serverTransform(code, id, {
            id: generateId,
            importClient: "registerClientReference",
            importFrom: "@jacob-ebey/react-server-dom-vite/server",
            importServer: "registerServerReference",
          });
        }

        return clientTransform(code, id, {
          id: generateId,
          importFrom: "@jacob-ebey/react-server-dom-vite/client",
          importServer: "createServerReference",
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
